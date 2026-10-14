"""Inspect actual browser downloads and render PDFs with an independent engine.

Install the development-only dependencies in .tools/pdf-qa; they never ship in
HanCAD or process drawings remotely. Run with 64-bit Python on Windows.

Dependencies: python -m pip install --target .tools/pdf-qa pypdfium2==5.14.0
pillow==12.3.0 pypdf==6.20.1

First run node scripts/verify-export-svg.mjs [artifact-directory]. Then run
this script with --directory [artifact-directory] to compare the SVG render
with PNG and independently render and inspect the PDF.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / ".tools" / "pdf-qa"))

from PIL import Image, ImageChops  # noqa: E402
from pypdf import PdfReader  # noqa: E402
import pypdfium2 as pdfium  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def inspect_svg(path: Path) -> dict[str, object]:
    root = ET.parse(path).getroot()
    require(root.tag == "{http://www.w3.org/2000/svg}svg", "Missing SVG root/namespace")
    viewbox = [float(value) for value in re.split(r"[,\s]+", root.attrib.get("viewBox", "").strip()) if value]
    require(len(viewbox) == 4 and all(math.isfinite(value) for value in viewbox), "Invalid SVG viewBox")
    require(viewbox[2] > 0 and viewbox[3] > 0, "Empty SVG viewBox")
    shapes: dict[str, int] = {}
    for element in root.iter():
        kind = element.tag.rsplit("}", 1)[-1]
        require(kind not in {"script", "foreignObject"}, "Executable content in exported SVG")
        if kind in {"path", "line", "polyline", "polygon", "circle", "ellipse", "text", "image"}:
            shapes[kind] = shapes.get(kind, 0) + 1
        for key, value in element.attrib.items():
            require(not key.lower().startswith("on"), "Event handler in exported SVG")
            if key.rsplit("}", 1)[-1] == "href":
                require(not re.match(r"(?:https?:)?//", value, flags=re.IGNORECASE), "Remote dependency in exported SVG")
    require(bool(shapes), "No drawing elements in exported SVG")
    return {"viewBox": viewbox, "elements": shapes, "bytes": path.stat().st_size}


def inspect_raster(path: Path, expected_format: str) -> dict[str, object]:
    with Image.open(path) as image:
        require(image.format == expected_format, f"Download is not {expected_format}")
        image.load()
        require(image.width > 0 and image.height > 0, "Empty raster dimensions")
        rgb = image.convert("RGB")
        extrema = rgb.getextrema()
        require(any(low != high for low, high in extrema), "Exported raster is blank")
        drawing_bbox = ImageChops.difference(rgb, Image.new("RGB", rgb.size, "white")).getbbox()
        require(drawing_bbox is not None, "Raster drawing is empty")
        require(drawing_bbox[0] > 0 and drawing_bbox[1] > 0 and drawing_bbox[2] < image.width and drawing_bbox[3] < image.height, "Raster drawing touches image edges and may be clipped")
        return {"dimensions": list(image.size), "mode": image.mode, "drawingBounds": list(drawing_bbox), "bytes": path.stat().st_size}


def inspect_svg_render(svg: Path, png: Path, output: Path) -> dict[str, object]:
    rendered = output / f"{svg.stem}-svg-render.png"
    require(rendered.is_file(), "Run node scripts/verify-export-svg.mjs for this artifact directory first")
    with Image.open(rendered) as vector_image, Image.open(png) as raster_image:
        vector_histogram = vector_image.convert("L").histogram()
        raster_histogram = raster_image.convert("L").histogram()
        vector_ink = sum(vector_histogram[:235])
        raster_ink = sum(raster_histogram[:235])
        vector_area = vector_image.width * vector_image.height
        raster_area = raster_image.width * raster_image.height
        expected = raster_ink * vector_area / raster_area
        require(vector_ink >= max(1, expected * 0.05), "SVG loses visible drawing strokes compared with the PNG export")
        return {"rendered": str(rendered.relative_to(ROOT)), "visiblePixels": vector_ink, "pngVisiblePixels": raster_ink}


def inspect_pdf(path: Path, output: Path) -> dict[str, object]:
    reader = PdfReader(path, strict=True)
    require(not reader.is_encrypted, "Exported PDF unexpectedly encrypted")
    require(len(reader.pages) == 1, "Expected one drawing per exported PDF")
    page_reports = []
    with pdfium.PdfDocument(path) as document:
        require(len(document) == len(reader.pages), "Independent PDF parsers disagree about page count")
        for index, source_page in enumerate(reader.pages):
            width = float(source_page.mediabox.width)
            height = float(source_page.mediabox.height)
            require(all(math.isfinite(value) and value > 0 for value in [width, height]), "Invalid PDF page dimensions")
            require(abs(min(width, height) - 595.2756) < 1 and abs(max(width, height) - 841.8898) < 1, "Exported PDF is not A4")
            image_reports = []
            image_dimensions = []
            resources = source_page["/Resources"].get_object()
            for image_reference in resources.get("/XObject", {}).values():
                image_object = image_reference.get_object()
                if image_object.get("/Subtype") == "/Image":
                    require("/F" not in image_object, "PDF depends on an external image file")
                    require(image_object.get("/ColorSpace") == "/DeviceRGB", "Expected RGB PDF image")
                    require(image_object.get("/BitsPerComponent") == 8, "Expected 8-bit PDF image")
                    require(image_object.get("/Filter") == "/DCTDecode", "Expected self-contained JPEG PDF image")
                    image_dimensions.append([image_object.get("/Width"), image_object.get("/Height")])
            for image in source_page.images:
                image_reports.append({"name": image.name, "dimensions": list(image.image.size), "format": image.image.format})
            require(len(image_reports) == 1, "Expected one embedded drawing image")
            require(image_dimensions == [image_reports[0]["dimensions"]], "PDF image dimensions disagree with JPEG header")
            page = document[index]
            bitmap = page.render(scale=2)
            pil = bitmap.to_pil().convert("RGB")
            extrema = pil.getextrema()
            require(any(low != high for low, high in extrema), "Rendered PDF page is blank")
            rendered = output / f"{path.stem}-pdf-page-{index + 1}.png"
            pil.save(rendered)
            drawing_bbox = ImageChops.difference(pil, Image.new("RGB", pil.size, "white")).getbbox()
            require(drawing_bbox is not None, "PDF drawing is empty")
            require(drawing_bbox[0] > 0 and drawing_bbox[1] > 0 and drawing_bbox[2] < pil.width and drawing_bbox[3] < pil.height, "PDF drawing touches page edges and may be clipped")
            page_reports.append({
                "page": index + 1,
                "points": [width, height],
                "rendered": str(rendered.relative_to(ROOT)),
                "pixels": list(pil.size),
                "drawingBounds": list(drawing_bbox) if drawing_bbox else None,
                "images": image_reports,
                "textCharacters": len(source_page.extract_text() or ""),
            })
            bitmap.close()
            page.close()
    return {"pages": page_reports, "bytes": path.stat().st_size, "metadata": dict(reader.metadata or {})}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "test-artifacts" / "newexports")
    args = parser.parse_args()
    directory = args.directory.resolve()
    require(directory.is_relative_to(ROOT), "Artifact directory must be inside the project")
    pdfs = sorted(directory.glob("*.pdf"))
    require(bool(pdfs), f"No actual PDF downloads found: {directory}")
    output = directory / "verified"
    output.mkdir(parents=True, exist_ok=True)
    reports = []
    for path in pdfs:
        png = path.with_suffix(".png")
        jpg = path.with_suffix(".jpg")
        svg = path.with_suffix(".svg")
        require(png.is_file() and jpg.is_file() and svg.is_file(), f"Missing companion PNG/JPG/SVG exports for {path.name}")
        reports.append({
            "drawing": path.stem,
            "pdf": inspect_pdf(path, output),
            "png": inspect_raster(png, "PNG"),
            "jpg": inspect_raster(jpg, "JPEG"),
            "svg": inspect_svg(svg),
            "svgRender": inspect_svg_render(svg, png, output),
        })
    report_path = output / "export-inspection.json"
    report_path.write_text(json.dumps(reports, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"verified": len(reports), "report": str(report_path.relative_to(ROOT)), "results": reports}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Export verification failed: {error}", file=sys.stderr)
        sys.exit(1)

"""Generate factual DXF code metadata from Autodesk's official 2026 reference."""

import concurrent.futures
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = "https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/"
INDEXES = {
    "entity": "GUID-7D07C886-FD1D-4A0C-A7AB-B4D21F18E484.htm",
    "object": "GUID-2D71EE99-A6BE-4060-9B43-808CF1E201C6.htm",
}
def text(value):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", value)).split())


def fetch(name):
    request = urllib.request.Request(ROOT + name, headers={"User-Agent": "HanCAD DXF reference metadata"})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read().decode("utf-8")


def links(source):
    return [(url, text(label)) for url, label in re.findall(r'<a[^>]+href="(GUID-[^"/]+\.htm)"[^>]*>(.*?)</a>', source, re.S)]


def codes(label):
    if not re.match(r"^-?\d", label):
        return None
    # Parenthesized exclusions are separate metadata, never included in the code range.
    expression = label.split("(")[0].strip()
    ranges = [[int(a), int(b)] for a, b in re.findall(r"(\d+)\s*[-–]\s*(\d+)", expression)]
    singles = [int(value) for value in re.findall(r"-?\d+", re.sub(r"\d+\s*[-–]\s*\d+", "", expression))]
    result = {"codes": singles}
    if ranges:
        result["ranges"] = ranges
    if "except" in label.lower():
        result["excluded"] = [int(value) for value in re.findall(r"\d+", label.split("except", 1)[1])]
    return result


def rows(source):
    result = []
    subclasses = []
    context = "record"
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", source, re.S):
        cells = [text(cell) for cell in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 2:
            continue
        group = codes(cells[0])
        if group is None:
            continue
        description = cells[1]
        if group["codes"] == [100]:
            names = re.findall(r"AcDb[A-Za-z0-9_]+", description)
            if names:
                subclasses = names
        if group["codes"] == [102]:
            context = "application" if "start" in description.lower() or "{ACAD_" in description else "record"
        if 1001 in group["codes"]:
            context = "xdata"
        group.update({"subclasses": subclasses.copy(), "context": context, "repeated": bool(re.search(r"multiple|repeat|chunks|one (?:entry|or more|for each)|for each|per (?:vertex|knot|control|fit|cell|row|element)", description, re.I))})
        result.append(group)
    return result


def document(name, section):
    source = fetch(name)
    headings = re.findall(r"<h1\b[^>]*>(.*?)</h1>", source, re.S)
    title = text(headings[0]) if headings else name
    return {"title": title, "source": ROOT + name, "section": section, "documentedGroups": rows(source), "children": [ROOT + url for url, _ in links(source)]}


def main():
    output = Path(__file__).resolve().parents[1] / "src" / "dxf-reference"
    if "--from-cache" in sys.argv:
        documents = {}
        for path in sorted(output.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            source = data["source"]
            if source in documents:
                documents[source]["documentedGroups"].extend(data["documentedGroups"])
            else:
                documents[source] = data
        for argument in sys.argv:
            if argument.startswith("--refresh-title="):
                title = argument.removeprefix("--refresh-title=") + " (DXF)"
                for source, data in documents.items():
                    if data["title"] == title:
                        documents[source] = document(source.removeprefix(ROOT), data["section"])
        write_documents(output, documents)
        return
    documents = {}
    planned = {}
    for section, name in INDEXES.items():
        for url, title in links(fetch(name)):
            planned[url] = section
    # The older index is used only as a stable link index. Every fact is fetched from 2026.
    with urllib.request.urlopen("https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/index.htm", timeout=40) as response:
        index = response.read().decode("utf-8")
    table_names = {"APPID", "BLOCK_RECORD", "DIMSTYLE", "LAYER", "LTYPE", "STYLE", "UCS", "VIEW", "VPORT"}
    for url, title in links(index):
        if title.replace(" (DXF)", "") in table_names:
            planned[url] = "table"
    frontier = planned
    while frontier:
        if len(documents) + len(frontier) > 180:
            raise RuntimeError("Unexpected reference link expansion")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = {executor.submit(document, name, section): name for name, section in frontier.items()}
            loaded = []
            for future in concurrent.futures.as_completed(futures):
                loaded.append((futures[future], future.result()))
        frontier = {}
        for name, data in sorted(loaded):
            documents[name] = data
            for child in data["children"]:
                child_name = child.removeprefix(ROOT)
                if child_name not in documents and child_name not in planned:
                    frontier[child_name] = data["section"]
                    planned[child_name] = data["section"]
    output.mkdir(exist_ok=True)
    write_documents(output, documents)
    print(json.dumps({"documents": len(documents), "rows": sum(len(data["documentedGroups"]) for data in documents.values()), "emptyTables": [data["title"] for data in documents.values() if not data["documentedGroups"]]}))


def write_documents(output, documents):
    for section in ["entity", "object", "table"]:
        selected = sorted([data for data in documents.values() if data["section"] == section], key=lambda item: item["source"])
        imports = []
        names = []
        index = 0
        for data in selected:
            rows = data["documentedGroups"]
            chunks = [rows[start:start + 20] for start in range(0, len(rows), 20)] or [[]]
            for chunk in chunks:
                record = {**data, "documentedGroups": chunk}
                path = section + "-" + str(index).zfill(3) + ".json"
                (output / path).write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                name = "document" + str(index)
                imports.append("import " + name + " from './dxf-reference/" + path + "';")
                names.append(name)
                index += 1
        module = "// Generated numeric facts from Autodesk's official 2026 DXF reference.\n" + "\n".join(imports) + "\n\nexport const " + section + "DxfReferences = [\n" + "\n".join("  " + name + "," for name in names) + "];\n"
        (output.parent / ("dxf-reference-" + section + ".ts")).write_text(module, encoding="utf-8")


if __name__ == "__main__":
    main()

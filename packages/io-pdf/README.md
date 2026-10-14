# @hancad/io-pdf

## Responsibility

Local drawing exports to PDF, PNG, JPG, SVG and DXF; future vector PDF plotting, CJK subsets, PDF underlays and import.

## Allowed dependencies

Current adapter: @hancad/legacy-bridge. Future writer: @hancad/db, @hancad/geom, @hancad/fonts.

## Current status

PDF 1.4 export is implemented with a fitted JPEG image on A4 (automatic portrait/landscape), centered with 10 mm margins. Korean text and visible geometry are rasterized on white paper, then embedded locally. PNG/JPG use the same white drawing surface; SVG/DXF use the existing local serializers. Raster PDF text is not searchable and strokes are not vector objects. CJK font subsetting, vector PDF, PDFIMPORT, page setup, print scale and underlays remain planned.

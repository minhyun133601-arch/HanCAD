param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$nativeClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
$nativePacket = $nativeClipboard.GetData('UnicodeText') | ConvertFrom-Json
$nativeImage = [System.Windows.Forms.Clipboard]::GetImage()
$nativePng = $nativeClipboard.GetData('PNG')
$nativePngImage = if ($nativePng -is [System.IO.Stream]) { [System.Drawing.Image]::FromStream($nativePng) }
if ($nativeImage) { $nativeImage.Save((Join-Path $OutputDirectory 'native-cf-bitmap.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
if ($nativePng -is [System.IO.MemoryStream]) { [System.IO.File]::WriteAllBytes((Join-Path $OutputDirectory 'native-registered-png.png'), $nativePng.ToArray()) }
$nativePixelMismatches = 0
$nativePngBitmap = if ($nativePngImage) { [System.Drawing.Bitmap]::new($nativePngImage) }
if ($nativeImage -and $nativePngBitmap -and $nativeImage.Width -eq $nativePngBitmap.Width -and $nativeImage.Height -eq $nativePngBitmap.Height) {
  for ($nativeY = 0; $nativeY -lt $nativeImage.Height; $nativeY++) {
    for ($nativeX = 0; $nativeX -lt $nativeImage.Width; $nativeX++) {
      if (($nativeImage.GetPixel($nativeX, $nativeY).ToArgb() -band 0xffffff) -ne ($nativePngBitmap.GetPixel($nativeX, $nativeY).ToArgb() -band 0xffffff)) { $nativePixelMismatches++ }
    }
  }
} else { $nativePixelMismatches = -1 }
[pscustomobject]@{
  formats = $nativeClipboard.GetFormats($false)
  format = $nativePacket.format
  version = $nativePacket.version
  basePoint = $nativePacket.basePoint
  entityCount = $nativePacket.state.entities.Count
  sourceFrameMode = $nativePacket.state.entities[0].frameMode
  imageWidth = $nativeImage.Width
  imageHeight = $nativeImage.Height
  pngWidth = $nativePngImage.Width
  pngHeight = $nativePngImage.Height
  pixelMismatches = $nativePixelMismatches
} | ConvertTo-Json -Depth 4
if ($nativeImage) { $nativeImage.Dispose() }
if ($nativePngImage) { $nativePngImage.Dispose() }

if ($nativePngBitmap) { $nativePngBitmap.Dispose() }

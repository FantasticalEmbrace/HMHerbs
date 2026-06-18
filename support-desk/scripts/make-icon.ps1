#Requires -Version 5.1
# Build square app icon from assets/icon-source.png (Business One logo)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$canonicalLogo = Join-Path $root '..\images\business-one\logo.png'
$sourcePath = Join-Path $root 'assets\icon-source.png'
$fallbackPath = Join-Path $root 'assets\icon.png'
$pngPath = Join-Path $root 'assets\icon.png'
$icoPath = Join-Path $root 'assets\icon.ico'

if (Test-Path $canonicalLogo) {
    Copy-Item -Path $canonicalLogo -Destination $sourcePath -Force
}

if (Test-Path $sourcePath) {
    $inputPath = $sourcePath
} elseif (Test-Path $fallbackPath) {
    $inputPath = $fallbackPath
} else {
    Write-Error "Missing assets\icon-source.png (your Business One logo)"
}

Add-Type -AssemblyName System.Drawing

function New-SquareIconBitmap([System.Drawing.Image]$src, [int]$size, [int]$padding) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $ratio = $src.Width / [double]$src.Height
    $isSquare = [Math]::Abs($ratio - 1.0) -lt 0.12

    if ($isSquare) {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($src, 0, 0, $size, $size)
    } else {
        $g.Clear([System.Drawing.Color]::White)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $inner = $size - (2 * $padding)
        $scale = [Math]::Min($inner / $src.Width, $inner / $src.Height)
        $drawW = [int][Math]::Round($src.Width * $scale)
        $drawH = [int][Math]::Round($src.Height * $scale)
        $x = [int][Math]::Round(($size - $drawW) / 2)
        $y = [int][Math]::Round(($size - $drawH) / 2)
        $g.DrawImage($src, $x, $y, $drawW, $drawH)
    }
    $g.Dispose()
    return $bmp
}

$src = [System.Drawing.Image]::FromFile($inputPath)
try {
    $master = New-SquareIconBitmap $src 512 40
    $master.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $master.Dispose()

    # Multi-size .ico for Windows shell + installer
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $iconStream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter $iconStream

    $images = New-Object System.Collections.Generic.List[object]
    foreach ($s in $sizes) {
        $pad = if ($s -le 32) { 2 } elseif ($s -le 64) { 4 } else { [int]($s * 0.08) }
        $bmp = New-SquareIconBitmap $src $s $pad
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $images.Add(@{ Size = $s; Data = $ms.ToArray() })
        $ms.Dispose()
    }

    $writer.Write([int16]0)   # reserved
    $writer.Write([int16]1)   # type: icon
    $writer.Write([int16]$images.Count)
    $offset = 6 + (16 * $images.Count)

    foreach ($img in $images) {
        $w = if ($img.Size -ge 256) { [byte]0 } else { [byte]$img.Size }
        $h = $w
        $writer.Write($w)
        $writer.Write($h)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([int16]1)
        $writer.Write([int16]32)
        $writer.Write([int32]$img.Data.Length)
        $writer.Write([int32]$offset)
        $offset += $img.Data.Length
    }

    foreach ($img in $images) {
        $writer.Write($img.Data)
    }

    [System.IO.File]::WriteAllBytes($icoPath, $iconStream.ToArray())
    $writer.Close()
    $iconStream.Close()
} finally {
    $src.Dispose()
}

Write-Host "Wrote $pngPath and $icoPath from $inputPath"

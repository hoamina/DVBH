$path = 'F:\claude\QLBH 3T\cloudflare smarttrade base\frontend\src\modules\DatMuaLinhKienModule.tsx'
$content = Get-Content -Path $path -Raw -Encoding UTF8
$content = $content -replace '<Modal title=', '<Modal open title='
Set-Content -Path $path -Value $content -Encoding UTF8 -NoNewline
Write-Output "done"

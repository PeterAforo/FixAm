$ErrorActionPreference = "Stop"
$dir = "tests\fixtures\part-photos"
# term -> manifest filename
$map = [ordered]@{
  "brake pads automobile" = "front-brake-pads-1.jpg"
  "spark plug" = "spark-plugs-1.jpg"
  "car air filter" = "air-filter-1.jpg"
  "oil filter engine" = "oil-filter-1.jpg"
  "cabin air filter car" = "cabin-filter-1.jpg"
  "car battery" = "battery-1.jpg"
  "car alternator" = "alternator-1.jpg"
  "windshield wiper blade" = "wiper-blades-1.jpg"
  "shock absorber car" = "front-shock-absorbers-1.jpg"
  "car headlight bulb" = "headlight-bulb-1.jpg"
  "car radiator" = "radiator-1.jpg"
  "wheel bearing" = "wheel-bearing-1.jpg"
}
foreach ($term in $map.Keys) {
  $file = $map[$term]
  $out = Join-Path $dir $file
  if (Test-Path $out) { Write-Output "skip $file (exists)"; continue }
  $q = [uri]::EscapeDataString($term)
  $api = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=$q&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=1024&format=json"
  try {
    $json = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "FixAm-dev/1.0 (test fixtures)" } -TimeoutSec 30
    $pages = $json.query.pages.PSObject.Properties.Value | Where-Object { $_.imageinfo }
    $img = $null
    foreach ($p in $pages) {
      $ii = $p.imageinfo[0]
      if ($ii.mime -match "image/(jpeg|png)") { $img = $ii; break }
    }
    if (-not $img) { Write-Output "no image for $term"; continue }
    Invoke-WebRequest -Uri $img.thumburl -OutFile $out -Headers @{ "User-Agent" = "FixAm-dev/1.0" } -TimeoutSec 60
    Write-Output "got $file <- $($img.thumburl.Substring(0, [Math]::Min(90, $img.thumburl.Length)))"
  } catch {
    Write-Output "FAIL $term : $($_.Exception.Message)"
  }
}

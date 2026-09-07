$ErrorActionPreference = 'Stop'
$version = '1.8.3'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root ".tools/temporal/$version"
$archiveName = "temporal_cli_${version}_windows_amd64.zip"
$release = "https://github.com/temporalio/cli/releases/download/v$version"
New-Item -ItemType Directory -Force -Path $target | Out-Null
$archive = Join-Path $target $archiveName
if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing "$release/$archiveName" -OutFile $archive }
$checksums = (Invoke-WebRequest -UseBasicParsing "$release/checksums.txt").Content
if ($checksums -is [byte[]]) { $checksums = [Text.Encoding]::UTF8.GetString($checksums) }
$line = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith($archiveName) })
if (@($line).Count -ne 1) { throw 'Archive checksum entry missing or ambiguous.' }
$expected = ($line.Trim() -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { throw 'Temporal archive checksum mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
$binary = Join-Path $target 'temporal.exe'
& $binary --version
if ($LASTEXITCODE -ne 0) { throw 'Temporal version verification failed.' }
Write-Output "Verified SHA256: $actual"
Write-Output "Installed official release at $binary (project-local; npm scripts resolve this path)."



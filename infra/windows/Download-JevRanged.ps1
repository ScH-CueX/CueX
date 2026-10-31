# Resume an existing prefix, fetch only its missing tail with eight bounded ranges.
[CmdletBinding()]
param(
    [string]$Root = 'C:\cuex',
    [ValidateSet('q4','q8')][string]$Selection = 'q4',
    [ValidateRange(1,16)][int]$Connections = 8,
    [string]$Proxy = 'http://127.0.0.1:7890'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $IsWindows){throw 'Run on Windows only.'}
$manifest=Get-Content (Join-Path $PSScriptRoot 'jev-downloads.json') -Raw | ConvertFrom-Json
$name=if($Selection -eq 'q4'){'Qwen3.5-9B-Q4_K_M.gguf'}else{'Qwen3.5-9B-Q8_0.gguf'}
$entry=$manifest | Where-Object file -eq $name
$destination=Join-Path $Root $entry.target
$prefix="$destination.partial"
$rangeDir="$destination.ranges"
$planPath=Join-Path $rangeDir 'plan.json'
$url="https://huggingface.co/$($entry.repo)/resolve/$($entry.revision)/$($entry.file)"
if(Test-Path $destination){
    if((Get-Item $destination).Length -ne [long]$entry.bytes -or (Get-FileHash $destination -Algorithm SHA256).Hash -ine $entry.sha256){throw 'Existing destination mismatch.'}
    Write-Output "Already verified: $destination"
    return
}
New-Item -ItemType Directory -Path (Split-Path $destination),$rangeDir -Force | Out-Null
$prefixBytes=if(Test-Path $prefix){[long](Get-Item $prefix).Length}else{[long]0}
if(Test-Path $planPath){
    $plan=Get-Content $planPath -Raw | ConvertFrom-Json
    if([long]$plan.prefixBytes -ne $prefixBytes -or $plan.sha256 -cne $entry.sha256){throw 'Range plan no longer matches prefix.'}
    $ranges=@($plan.ranges)
}else{
    $remaining=[long]$entry.bytes-$prefixBytes
    if($remaining -lt 0){throw 'Existing partial is larger than expected.'}
    $chunk=[long][Math]::Ceiling($remaining/[double]$Connections)
    $ranges=@(for($i=0;$i -lt $Connections;$i++){
        $start=$prefixBytes+$i*$chunk
        $end=[Math]::Min([long]$entry.bytes-1,$start+$chunk-1)
        if($start -le $end){[pscustomobject]@{index=$i;start=$start;end=$end;bytes=$end-$start+1;file=(Join-Path $rangeDir "$i.part")}}
    })
    [pscustomobject]@{prefixBytes=$prefixBytes;sha256=$entry.sha256;ranges=$ranges} | ConvertTo-Json -Depth 5 | Set-Content $planPath
}
Write-Output "Preserving $prefixBytes prefix bytes. Fetching $($ranges.Count) tail ranges."
$ranges | ForEach-Object -Parallel {
    $ErrorActionPreference='Stop'
    $r=$_
    if((Test-Path $r.file) -and (Get-Item $r.file).Length -eq [long]$r.bytes){Write-Output "Range $($r.index) reused"; return}
    $proxyArgs=@()
    if(-not [string]::IsNullOrWhiteSpace($using:Proxy)){$proxyArgs=@('--proxy',$using:Proxy)}
    & curl.exe --disable --fail --location --proto '=https' --proto-redir '=https' --retry 5 --retry-delay 2 --silent --show-error @proxyArgs --range "$($r.start)-$($r.end)" --output $r.file $using:url
    if($LASTEXITCODE -ne 0){throw "Range $($r.index) curl failed $LASTEXITCODE"}
    if((Get-Item $r.file).Length -ne [long]$r.bytes){throw "Range $($r.index) size mismatch"}
    Write-Output "Range $($r.index) complete: $($r.bytes) bytes"
} -ThrottleLimit $Connections
foreach($r in $ranges){if(-not(Test-Path $r.file) -or (Get-Item $r.file).Length -ne [long]$r.bytes){throw "Missing range $($r.index)"}}
$assembled="$destination.assembling"
$out=[IO.File]::Open($assembled,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{
    $parts=@()
    if($prefixBytes -gt 0){$parts+=$prefix}
    $parts+=@($ranges | Sort-Object index | ForEach-Object file)
    foreach($part in $parts){$stream=[IO.File]::OpenRead($part); try{$stream.CopyTo($out)}finally{$stream.Dispose()}}
}finally{$out.Dispose()}
if((Get-Item $assembled).Length -ne [long]$entry.bytes){throw 'Assembled size mismatch.'}
$hash=(Get-FileHash $assembled -Algorithm SHA256).Hash.ToLowerInvariant()
if($hash -cne $entry.sha256){throw 'Assembled SHA256 mismatch.'}
[IO.File]::Move($assembled,$destination)
[pscustomobject]@{file=$destination;bytes=[long]$entry.bytes;sha256=$hash} | ConvertTo-Json
# Remove only this completed download's redundant prefix and range pieces.
if(Test-Path $prefix){Remove-Item -LiteralPath $prefix}
foreach($r in $ranges){Remove-Item -LiteralPath $r.file}
Remove-Item -LiteralPath $planPath
Remove-Item -LiteralPath $rangeDir

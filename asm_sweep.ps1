$ml64 = 'C:\VS2022Enterprise\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64\ml64.exe'
$inc1 = 'd:\rawrxd\include'
$inc2 = 'd:\rawrxd\src\asm'
$outDir = 'd:\rawrxd\asm_obj_sweep'
$errLog = 'd:\rawrxd\asm_sweep_errors.log'
$okLog  = 'd:\rawrxd\asm_sweep_ok.log'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $errLog) { Remove-Item $errLog }
if (Test-Path $okLog)  { Remove-Item $okLog }
$files = Get-Content d:\rawrxd\asm_inventory.txt
$total = $files.Count
$files | ForEach-Object -Parallel {
    $f = $_
    $name = [System.IO.Path]::GetFileNameWithoutExtension($f)
    $obj = "$using:outDir\$name.obj"
    $out = "$using:outDir\$name.out"
    $err = "$using:outDir\$name.err"
    $flag = "$using:outDir\$name.flag"
    $proc = Start-Process -FilePath $using:ml64 -ArgumentList "/c /W3 /nologo /I `"$using:inc1`" /I `"$using:inc2`" /Fo `"$obj`" `"$f`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    if ($proc.ExitCode -ne 0) {
        [void][System.IO.File]::WriteAllText($flag, "FAIL`n" + (Get-Content $err -Raw))
    } else {
        [void][System.IO.File]::WriteAllText($flag, "OK")
    }
} -ThrottleLimit 8
$okFiles = Get-ChildItem -Path $outDir -Filter *.flag | Where-Object { (Get-Content $_.FullName -TotalCount 1) -eq 'OK' } | ForEach-Object { $_.BaseName }
$failFiles = Get-ChildItem -Path $outDir -Filter *.flag | Where-Object { (Get-Content $_.FullName -TotalCount 1) -ne 'OK' } | ForEach-Object { $_.BaseName }
foreach ($name in $okFiles) {
    "$name" | Out-File -FilePath $okLog -Append
}
foreach ($name in $failFiles) {
    "$name" | Out-File -FilePath $errLog -Append
}
Write-Host "Sweep complete. OK=$($okFiles.Count) Fail=$($failFiles.Count) Total=$total"

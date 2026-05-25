# 変更したLambda関数とWebファイルをデプロイするスクリプト
# 実行前に: aws sso login --profile c3test

$dist = "C:\Users\31508\Projects\schedule.app-1\dist\handlers"
$outDir = "C:\Users\31508\AppData\Local\Temp\lambda-zips"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 今回変更した関数のみデプロイ
$functions = @{
    "post-save-kame" = "post-save"
    "post-get-kame"  = "post-get"
}

foreach ($entry in $functions.GetEnumerator()) {
    $funcName = $entry.Key
    $handler = $entry.Value
    $js  = "$dist\$handler.js"
    $map = "$dist\$handler.js.map"
    $zip = "$outDir\$funcName.zip"

    if (Test-Path $map) {
        Compress-Archive -Force -Path $js, $map -DestinationPath $zip
    } else {
        Compress-Archive -Force -Path $js -DestinationPath $zip
    }

    Write-Host "Deploying $funcName ..."
    aws lambda update-function-code `
        --function-name $funcName `
        --zip-file "fileb://$zip" `
        --no-cli-pager --output text `
        --region ap-northeast-1 `
        --profile c3test 2>&1 | Select-Object -Last 2
    Write-Host ""
}

Write-Host "Syncing web assets to S3..."
$bucket = "family-schedule-web-kame-982312822872"
$webDir = "C:\Users\31508\Projects\schedule.app-1\web"
$noCacheVal = "no-cache,no-store,must-revalidate"

aws s3 cp "$webDir\home.html"      "s3://${bucket}/home.html"      --cache-control "no-cache,no-store,must-revalidate" --no-cli-pager --region ap-northeast-1 --profile c3test
aws s3 cp "$webDir\dashboard.html" "s3://${bucket}/dashboard.html" --cache-control "no-cache,no-store,must-revalidate" --no-cli-pager --region ap-northeast-1 --profile c3test

# JSファイルをno-cacheで同期（ブラウザキャッシュ回避）
aws s3 sync "$webDir\scripts" "s3://${bucket}/scripts/" --cache-control "no-cache,no-store,must-revalidate" --no-cli-pager --region ap-northeast-1 --profile c3test

Write-Host "`nDeploy complete!"

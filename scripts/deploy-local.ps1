$dist = "C:\Users\31508\Projects\schedule.app-1\dist\handlers"
$outDir = "C:\Users\31508\AppData\Local\Temp\lambda-zips"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$functions = @{
    "family-schedule-webhook-kame" = "webhook"
    "family-schedule-submit-kame" = "schedule-submit"
    "family-schedule-get-kame" = "schedule-get"
    "family-schedule-week-get-kame" = "schedule-week-get"
    "family-schedule-weekly-reminder-kame" = "weekly-reminder"
    "chirol-hitokoto-kame" = "chirol-hitokoto"
    "chirol-image-kame" = "chirol-image"
    "post-get-kame" = "post-get"
    "post-save-kame" = "post-save"
    "wannade-save-kame" = "wannade-save"
}

foreach ($entry in $functions.GetEnumerator()) {
    $funcName = $entry.Key
    $handler = $entry.Value
    $js = "$dist\$handler.js"
    $map = "$dist\$handler.js.map"
    $zip = "$outDir\$funcName.zip"

    if (Test-Path $map) {
        Compress-Archive -Force -Path $js, $map -DestinationPath $zip
    } else {
        Compress-Archive -Force -Path $js -DestinationPath $zip
    }

    Write-Host "Deploying $funcName..."
    aws lambda update-function-code --function-name $funcName --zip-file "fileb://$zip" --no-cli-pager --output text --region ap-northeast-1 2>&1 | Select-Object -Last 1
}

Write-Host "`nSyncing web assets to S3..."
$bucket = "family-schedule-web-kame-982312822872"
$webDir = "C:\Users\31508\Projects\schedule.app-1\web"
$noCacheVal = "no-cache,no-store,must-revalidate"

aws s3 cp "$webDir\home.html" "s3://$bucket/home.html" --cache-control $noCacheVal --no-cli-pager --region ap-northeast-1
aws s3 cp "$webDir\dashboard.html" "s3://$bucket/dashboard.html" --cache-control $noCacheVal --no-cli-pager --region ap-northeast-1
aws s3 cp "$webDir\sw.js" "s3://$bucket/sw.js" --cache-control $noCacheVal --no-cli-pager --region ap-northeast-1
aws s3 cp "$webDir\manifest.json" "s3://$bucket/manifest.json" --cache-control $noCacheVal --no-cli-pager --region ap-northeast-1

aws s3 sync $webDir "s3://$bucket/" --delete --cache-control "no-cache,no-store,must-revalidate" --exclude "*.html" --exclude "sw.js" --exclude "manifest.json" --exclude "images/*" --no-cli-pager --region ap-northeast-1

aws s3 sync "$webDir\images" "s3://$bucket/images/" --cache-control "public,max-age=31536000,immutable" --no-cli-pager --region ap-northeast-1

Write-Host "`nDeploy complete!"
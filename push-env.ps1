$content = Get-Content "Planning/apikeys.txt"
foreach ($line in $content) {
    if ($line -match "^([A-Za-z0-9_]+)=(.*)$") {
        $key = $Matches[1]
        $value = $Matches[2]
        # Skip VERCEL keys or comments
        if ($key -match "^VERCEL_") { continue }
        
        Write-Host "Adding $key to Vercel production..."
        # Add to production, preview, development
        $value | vercel env add $key production
        $value | vercel env add $key preview
        $value | vercel env add $key development
    }
}
Write-Host "All env variables pushed."

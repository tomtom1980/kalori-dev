/**
 * LHCI puppeteerScript: pre-authenticate against Vercel SSO-protected
 * preview by visiting the bypass-cookie URL once. Subsequent LHCI
 * audits run against the actual audit URLs with the _vercel_jwt
 * cookie set, so neither the bypass token nor the bypass header
 * appears in audit reports.
 *
 * Activated via lighthouserc.json's collect.settings.puppeteerScript.
 *
 * Required env: VERCEL_AUTOMATION_BYPASS_SECRET, LHCI_VERCEL_BASE_URL
 */
module.exports = async (browser, context) => {
  const token = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const baseUrl = process.env.LHCI_VERCEL_BASE_URL;
  if (!token || !baseUrl) {
    console.log(
      '[lhci-vercel-bypass] Skipping bypass: VERCEL_AUTOMATION_BYPASS_SECRET or LHCI_VERCEL_BASE_URL not set',
    );
    return;
  }
  const page = await browser.newPage();
  try {
    const bypassUrl = `${baseUrl}?x-vercel-protection-bypass=${encodeURIComponent(token)}&x-vercel-set-bypass-cookie=samesitenone`;
    await page.goto(bypassUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('[lhci-vercel-bypass] Bypass cookie set; LHCI audits proceed');
  } finally {
    await page.close();
  }
};

/* ── GA4 on every page, without editing every page ───────────────────────────
   23 of the 24 landing pages carried no analytics at all, so the entire GEO
   content library was invisible in reporting. Rather than paste the same block
   into 23 files and keep them in sync forever, this injects it once at the edge
   as the HTML streams to the browser.

   Deliberately defensive: anything that is not an HTML document is passed
   through untouched, and any failure returns the original response rather than
   breaking the page.                                                          */

const GA4_ID = "G-6XW1DFSRC2";

const GA4_TAG =
  '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA4_ID + '"></script>' +
  '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}' +
  "gtag('js',new Date());gtag('config','" + GA4_ID + "');</script>";

export async function onRequest(context) {
  let response;
  try {
    response = await context.next();
  } catch (e) {
    throw e;                                   /* never swallow a real error */
  }

  try {
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;   /* images, js, css, txt */

    /* If the page already has the tag, leave it alone. Two tags on one page
       double-counts every pageview. */
    let already = false;
    const rewriter = new HTMLRewriter()
      .on("script[src*='googletagmanager.com/gtag/js']", {
        element() { already = true; }
      })
      .on("head", {
        element(el) { if (!already) el.append(GA4_TAG, { html: true }); }
      });

    return rewriter.transform(response);
  } catch (e) {
    return response;                           /* a broken injector must not break the site */
  }
}

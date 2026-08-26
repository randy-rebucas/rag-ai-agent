import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <div
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: a merchant's answers and actions are physical retail tags on a board, not a chatbot bubble — refuses the glowing chat-widget AI-SaaS template.
OWN-WORLD: kraft/manila and red-and-white tag stock, punched string holes, perforated tear edges, gun-embossed stencil numerals, black rule ties, on a cork/pegboard ground.
STORY: a merchant sees their store's real data and proposed actions as tangible hanging tags; the approval flow is a rubber APPROVED stamp punched onto a ticket before it's torn free and acted on; login is a claim ticket filled out to redeem the app.
FIRST VIEWPORT: a pegboard field fills the viewport; center-left a giant tag-gun ticket states the core claim in gun-embossed caps, string looped through its punched hole; smaller fact tags scatter around it; the claim-ticket login form anchors the CTA.
FORM: retail price-tag / tag-gun ticket system, direction 6 of 7, seed key fda3c1c4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
-->`,
          }}
        />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

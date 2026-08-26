import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;600;700&family=Permanent+Marker&display=swap",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.board}>
      <div className={styles.grain} aria-hidden="true" />

      <header className={styles.header}>
        <span className={styles.brandTag}>RAG AI AGENT</span>
        <span className={styles.brandSub}>store-grounded answers, merchant-approved actions</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroTicket}>
          <span className={styles.punch} aria-hidden="true" />
          <span className={styles.serial}>NO. 004219</span>
          <h1 className={styles.heroHeading}>
            KNOW YOUR
            <br />
            STORE.
            <br />
            <span className={styles.heroHeadingAccent}>APPROVE</span>
            <br />
            EVERY MOVE.
          </h1>
          <p className={styles.heroSub}>
            An agent that answers from your real product, order, and inventory
            data — and never changes a price, a discount, or a tag until you
            say so.
          </p>
          <div className={styles.perf} aria-hidden="true" />
          <span className={styles.stub}>KEEP THIS STUB</span>
        </div>

        <div className={styles.factTags} aria-hidden="true">
          <span className={`${styles.factTag} ${styles.factTagOne}`}>
            <b>PRODUCTS</b>
            synced live
          </span>
          <span className={`${styles.factTag} ${styles.factTagTwo}`}>
            <b>INVENTORY</b>
            tracked per SKU
          </span>
          <span className={`${styles.factTag} ${styles.factTagThree}`}>
            <b>ORDERS</b>
            read, not guessed
          </span>
          <span className={`${styles.factTag} ${styles.factTagFour}`}>
            <b>DISCOUNTS</b>
            proposed, not pushed
          </span>
        </div>
      </section>

      <section className={styles.howBoard}>
        <h2 className={styles.sectionTitle}>HOW IT'S TAGGED</h2>
        <div className={styles.howRow}>
          <article className={`${styles.howTag} ${styles.tagKraft}`}>
            <span className={styles.punchSmall} aria-hidden="true" />
            <span className={styles.howNum}>1</span>
            <h3>Ask anything</h3>
            <p>
              "What's low on stock?" "Which SKUs haven't sold in 60 days?"
              Answers are pulled from your live products, orders, inventory,
              and any docs you upload — not a guess.
            </p>
          </article>
          <article className={`${styles.howTag} ${styles.tagRed}`}>
            <span className={styles.punchSmall} aria-hidden="true" />
            <span className={styles.howNum}>2</span>
            <h3>Get a proposal</h3>
            <p>
              Need a price cut, a restock flag, or a discount adjusted? The
              agent writes up the exact change — never executes it on its
              own.
            </p>
          </article>
          <article className={`${styles.howTag} ${styles.tagKraft}`}>
            <span className={styles.punchSmall} aria-hidden="true" />
            <span className={styles.howNum}>3</span>
            <h3>Stamp it</h3>
            <div className={styles.stampWrap}>
              <p>
                You approve. One tap stamps the ticket and the change goes
                live — logged, reversible, on the record.
              </p>
              <span className={styles.stamp}>APPROVED</span>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.ledgerSection}>
        <h2 className={styles.sectionTitle}>WHAT'S ON THE MANIFEST</h2>
        <table className={styles.ledger}>
          <thead>
            <tr>
              <th>SOURCE</th>
              <th>WHAT IT SEES</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Products &amp; collections</td>
              <td>full catalog, kept current via webhook</td>
              <td className={styles.statusLive}>LIVE SYNC</td>
            </tr>
            <tr>
              <td>Inventory &amp; locations</td>
              <td>per-SKU levels across every location</td>
              <td className={styles.statusLive}>LIVE SYNC</td>
            </tr>
            <tr>
              <td>Orders &amp; customers</td>
              <td>read for context, never modified unasked</td>
              <td className={styles.statusLive}>READ ONLY</td>
            </tr>
            <tr>
              <td>Discounts</td>
              <td>current codes and status</td>
              <td className={styles.statusLive}>LIVE SYNC</td>
            </tr>
            <tr>
              <td>Your documents &amp; Drive</td>
              <td>uploaded files folded into what it knows</td>
              <td className={styles.statusUpload}>YOU ADD</td>
            </tr>
          </tbody>
        </table>
      </section>

      {showForm && (
        <section className={styles.claimSection}>
          <div className={styles.claimTicket}>
            <span className={styles.punch} aria-hidden="true" />
            <h2 className={styles.claimHeading}>CLAIM TICKET</h2>
            <p className={styles.claimSub}>
              $19.99/mo · 7-day free trial · cancel anytime in Shopify
            </p>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>SHOP DOMAIN</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="my-shop-domain.myshopify.com"
                  autoComplete="off"
                />
              </label>
              <button className={styles.button} type="submit">
                Redeem &amp; Install
              </button>
            </Form>
            <div className={styles.perf} aria-hidden="true" />
            <span className={styles.stub}>NO CARD REQUIRED TO START</span>
          </div>
        </section>
      )}

      <footer className={styles.receipt}>
        <span>RAG AI AGENT</span>
        <span className={styles.receiptDots} aria-hidden="true" />
        <span>GROUNDED IN YOUR DATA · APPROVED BY YOU</span>
      </footer>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { listDocuments, type DocumentSummary } from "../lib/memory/document-memory.server";
import type { KnowledgeLevel } from "../lib/intelligence/knowledge-level.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const documents = await listDocuments(shop.id);

  return { documents };
};

type DocumentUploadResult = {
  document?: { entityId: string; chunkCount: number; truncated: boolean };
  level?: KnowledgeLevel;
  error?: string;
};
type DocumentDeleteResult = { level?: KnowledgeLevel };

type UploadStage = "uploading" | "processing" | null;

function DocumentLibrary({ documents }: { documents: DocumentSummary[] }) {
  const deleteFetcher = useFetcher<DocumentDeleteResult>();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();
  const [uploadStage, setUploadStage] = useState<UploadStage>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);

  useEffect(() => {
    if (deleteFetcher.data) {
      shopify.toast.show("Document removed");
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.data]);

  const uploadFile = async (file: File) => {
    setUploadFilename(file.name);
    setUploadProgress(0);
    setUploadStage("uploading");

    // Embedded admin requests must carry a fresh Shopify session token —
    // App Bridge only attaches this automatically to window.fetch, not to
    // XMLHttpRequest, so it has to be fetched and set explicitly here.
    let token: string;
    try {
      token = await shopify.idToken();
    } catch {
      setUploadStage(null);
      setUploadFilename(null);
      shopify.toast.show("Couldn't authenticate the upload — please reload the page.", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ai/documents");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = () => setUploadStage("processing");
    xhr.onload = () => {
      setUploadStage(null);
      setUploadFilename(null);
      let result: DocumentUploadResult = {};
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        result = { error: "Upload failed — the server sent an unreadable response." };
      }
      if (xhr.status >= 400 || result.error) {
        shopify.toast.show(result.error ?? "Upload failed.", { isError: true });
        return;
      }
      if (result.document) {
        const { chunkCount, truncated } = result.document;
        const suffix = truncated ? " (only the first part of this file was used — it was very long)" : "";
        shopify.toast.show(`Learned ${chunkCount} passage${chunkCount === 1 ? "" : "s"} from your document${suffix}`);
        revalidator.revalidate();
      }
    };
    xhr.onerror = () => {
      setUploadStage(null);
      setUploadFilename(null);
      shopify.toast.show("Upload failed — check your connection and try again.", { isError: true });
    };
    xhr.send(formData);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-drop-zone
        label="Upload a document"
        labelAccessibilityVisibility="exclusive"
        accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={uploadStage !== null}
        onChange={(e) => {
          const file = e.currentTarget.files[0];
          if (file) uploadFile(file);
        }}
      >
        <s-stack direction="block" gap="small-300" alignItems="center">
          <s-icon type="upload" tone="info" />
          <s-text tone="neutral">
            {uploadStage === null
              ? "Drop a .txt, .md, .csv, .pdf, or .docx file, or click to browse"
              : uploadFilename}
          </s-text>
        </s-stack>
      </s-drop-zone>

      {uploadStage !== null && (
        <s-stack direction="block" gap="small-100">
          <div
            style={{
              height: "6px",
              borderRadius: "999px",
              background: "var(--p-color-bg-surface-secondary, #e3e3e3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "100%",
                borderRadius: "999px",
                background: "var(--p-color-bg-fill-info, #2c6ecb)",
                transform: `scaleX(${uploadStage === "uploading" ? uploadProgress / 100 : 1})`,
                transformOrigin: "left",
                transition: "transform 150ms ease-out",
              }}
            />
          </div>
          <s-text tone="neutral">
            {uploadStage === "uploading" ? `Uploading… ${uploadProgress}%` : "Learning from your document…"}
          </s-text>
        </s-stack>
      )}

      {documents.length === 0 ? (
        <s-text tone="neutral">No documents uploaded yet.</s-text>
      ) : (
        <s-stack direction="block" gap="small-300">
          {documents.map((doc) => (
            <s-box key={doc.entityId} padding="small-300" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-stack direction="block" gap="small-100">
                  <s-text>{doc.filename}</s-text>
                  <s-text tone="neutral">
                    {doc.chunkCount} passage{doc.chunkCount === 1 ? "" : "s"}
                    {!doc.downloadable && " · uploaded before file storage, no download available"}
                  </s-text>
                </s-stack>
                <s-stack direction="inline" gap="small-100">
                  {doc.downloadable && (
                    <s-button
                      variant="tertiary"
                      icon="download"
                      accessibilityLabel={`Download ${doc.filename}`}
                      href={`/api/ai/documents/${encodeURIComponent(doc.entityId)}/download`}
                      target="_blank"
                    />
                  )}
                  <s-button
                    variant="tertiary"
                    icon="delete"
                    accessibilityLabel={`Remove ${doc.filename}`}
                    onClick={() =>
                      deleteFetcher.submit(
                        { entityId: doc.entityId },
                        { method: "DELETE", action: "/api/ai/documents", encType: "application/json" },
                      )
                    }
                  />
                </s-stack>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      )}
    </s-stack>
  );
}

export default function DocumentsPage() {
  const { documents } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Documents">
      <s-section heading="Document library">
        <DocumentLibrary documents={documents} />
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Uploaded documents are chunked and embedded into semantic memory the same way store
          data is, so your AI store analyst can draw on them when answering questions.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

import { useId, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

const maxBytes = 8 * 1024 * 1024;
export default function ProjectCoverEditor({ title, image, disabled, onChange, onBusy }: {
  title: string; image: string; disabled: boolean;
  onChange: (url: string) => void; onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const [uploading, setUploading] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  async function upload(file?: File) {
    if (!file || disabled) return;
    setError(""); setStatus("");
    if (!file.size || file.size > maxBytes) { setError("Choose an image or GIF up to 8 MB."); return; }
    setUploading(true); onBusy(true);
    try {
      const signResponse = await fetch("/api/uploads/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: file.type, size: file.size }) });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error || "Unable to prepare the upload.");
      let response: Response;
      if (signed.mode === "supabase") {
        // The file travels straight to Storage, avoiding Vercel's request-body limit.
        const uploaded = await fetch(signed.signedUrl, { method: "PUT", headers: { "Content-Type": file.type, "cache-control": "max-age=31536000" }, body: file });
        if (!uploaded.ok) throw new Error("The image could not be uploaded. Check your connection and try again.");
        response = await fetch("/api/uploads/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: signed.path }) });
      } else {
        response = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed. Please try again.");
      onChange(data.url);
      setStatus("Cover uploaded. Save changes to show it on your portfolio.");
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); onBusy(false); }
  }
  return <div className="cover-editor">
    <div className="cover-editor-heading"><strong>Project cover</strong>{image && /\.gif(?:[?#]|$)/i.test(image) && <span>ANIMATED GIF</span>}</div>
    <div className={`cover-preview ${image ? "has-image" : ""}`}>
      {image ? <img key={image} src={image} alt={`${title} cover preview`} onError={() => setError("This image couldn’t be displayed. Try uploading another file or check the image URL.")}/> : <><ImagePlus size={28}/><span>Show visitors what you built.</span><small>Add a screenshot, product image, or animated demo.</small></>}
    </div>
    <div className="cover-controls">
      <label className="cover-upload-button" aria-disabled={disabled}>
        {uploading ? <LoaderCircle size={16} className="spin"/> : <ImagePlus size={16}/>}
        {uploading ? "Uploading…" : image ? "Replace image or GIF" : "Upload image or GIF"}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={`Upload cover for ${title}`} aria-describedby={`${id}-hint`} disabled={disabled} onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void upload(file); }}/>
      </label>
      {image && <button type="button" className="text-button" disabled={disabled} onClick={() => { onChange(""); setError(""); setStatus(""); }}><X size={14}/>Remove cover</button>}
    </div>
    <p id={`${id}-hint`} className="cover-hint">PNG, JPG, WebP or GIF · up to 8 MB. Animated files keep their animation.</p>
    {error && <p className="cover-error" role="alert">{error}</p>}
    {status && <p className="cover-status" role="status">{status}</p>}
    <label className="admin-field cover-url"><span>Or use an image URL (optional)</span><input type="url" value={image.startsWith("/uploads/") ? "" : image} placeholder="https://example.com/project.gif" disabled={disabled} onChange={e => { onChange(e.target.value); setError(""); setStatus(""); }}/></label>
  </div>;
}

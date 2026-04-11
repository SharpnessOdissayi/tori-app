import { useState, useCallback } from "react";

interface UseImageUploadReturn {
  isUploading: boolean;
  url: string | null;
  error: string | null;
  upload: (file: File) => Promise<void>;
  reset: () => void;
}

export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<void> => {
    setIsUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem("biz_token");
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!metaRes.ok) throw new Error("שגיאה בקבלת כתובת העלאה");

      const { uploadUrl, objectPath } = await metaRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("ההעלאה נכשלה");

      setUrl(`/api/storage/objects${objectPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ההעלאה נכשלה";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setUrl(null);
    setError(null);
    setIsUploading(false);
  }, []);

  return { isUploading, url, error, upload, reset };
}

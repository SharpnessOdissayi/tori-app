import { useState, useCallback } from "react";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

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
      if (!CLOUD_NAME || !UPLOAD_PRESET) {
        throw new Error("הגדרות Cloudinary חסרות — פנה למנהל המערכת");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("ההעלאה נכשלה");

      const data = await res.json();
      if (!data.secure_url) throw new Error("לא התקבלה כתובת תמונה");

      setUrl(data.secure_url);
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

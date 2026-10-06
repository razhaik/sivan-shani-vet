import { useEffect, useState } from "react";
import { optimizedImageSource, restoreOriginalImage } from "@/lib/optimizedImageUrl";

function userInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return value.trim().slice(0, 2) || "מר";
}

export function ProfileAvatar({
  name,
  imageUrl,
  className = "h-10 w-10",
  fallbackClassName = "text-sm",
  imageWidth = 96,
  alt = "",
}: {
  name: string;
  imageUrl?: string;
  className?: string;
  fallbackClassName?: string;
  imageWidth?: number;
  alt?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  const image = imageUrl
    ? optimizedImageSource(imageUrl, { width: imageWidth, fallbackWidth: Math.max(48, Math.round(imageWidth * 0.75)), quality: 75 })
    : null;
  const showImage = Boolean(image && !imageFailed);

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1A1A3E] font-black text-[#F2D162] shadow-sm ${className}`}>
      {showImage && image && (
        <img
          src={image.src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
          onError={(event) => {
            setImageFailed(true);
            restoreOriginalImage(event, image.fallbackSrc);
          }}
        />
      )}
      <span className={showImage ? "hidden" : fallbackClassName}>{userInitials(name)}</span>
    </span>
  );
}

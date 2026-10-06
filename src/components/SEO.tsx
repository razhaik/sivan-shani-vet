import { useEffect } from "react";

export interface SEOProps {
  /** Page title - appears in browser tab and search results (under 60 chars recommended) */
  title?: string;
  /** Page description - appears in search results (150-160 chars recommended) */
  description?: string;
  /** Image URL for social sharing. Can be relative (/image.png) or absolute. */
  image?: string;
  /** Accessible description for the social sharing image. */
  imageAlt?: string;
  /** Canonical URL of the page */
  url?: string;
  /** Set to true to prevent search engines from indexing this page */
  noindex?: boolean;
  /** Site name for Open Graph */
  siteName?: string;
}

/**
 * Converts a relative URL to an absolute URL using the current origin.
 */
function toAbsoluteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
  }
  return url;
}

function setMeta(name: string, content: string | undefined, attr = "name") {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string | undefined) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * SEO component for setting page meta tags using direct DOM manipulation.
 * Replaces react-helmet-async to avoid dependency issues.
 */
export function SEO({
  title,
  description,
  image,
  imageAlt,
  url,
  noindex = false,
  siteName,
}: SEOProps) {
  const absoluteImage = toAbsoluteUrl(image);
  const absoluteUrl = toAbsoluteUrl(url);

  useEffect(() => {
    // Basic meta tags
    if (title) document.title = title;
    
    if (description) {
      setMeta("description", description);
    }
    
    if (noindex) {
      setMeta("robots", "noindex, nofollow");
    }

    if (absoluteUrl) {
      setLink("canonical", absoluteUrl);
    }

    // Open Graph
    if (title) setMeta("og:title", title, "property");
    if (description) setMeta("og:description", description, "property");
    if (absoluteImage) setMeta("og:image", absoluteImage, "property");
    if (imageAlt) setMeta("og:image:alt", imageAlt, "property");
    if (absoluteUrl) setMeta("og:url", absoluteUrl, "property");
    setMeta("og:type", "website", "property");
    if (siteName) setMeta("og:site_name", siteName, "property");

    // Twitter
    setMeta("twitter:card", absoluteImage ? "summary_large_image" : "summary");
    if (title) setMeta("twitter:title", title);
    if (description) setMeta("twitter:description", description);
    if (absoluteImage) setMeta("twitter:image", absoluteImage);
  }, [title, description, absoluteImage, imageAlt, absoluteUrl, noindex, siteName]);

  return null;
}

/**
 * No-op Helmet component to maintain compatibility with existing imports.
 */
export const Helmet = ({ children }: { children?: React.ReactNode }) => {
  return null;
};

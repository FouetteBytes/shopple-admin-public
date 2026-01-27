import { useCallback, useEffect, useState } from 'react';
import { Gallery } from 'iconsax-react';
import Image from 'next/image';

type LightboxState = { url: string; index: number } | null;

type PhotoGalleryProps = {
  photoUrls: string[];
  requestId?: string;
};

export function PhotoGallery({ photoUrls, requestId }: PhotoGalleryProps) {
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  const openLightbox = useCallback(
    (index: number) => {
      if (!photoUrls[index]) return;
      setLightbox({ url: photoUrls[index], index });
    },
    [photoUrls]
  );

  const closeLightbox = useCallback(() => setLightbox(null), []);

  const handleNavigate = useCallback(
    (direction: 'next' | 'prev') => {
      if (!lightbox) return;
      const total = photoUrls.length;
      if (total === 0) return;
      const delta = direction === 'next' ? 1 : -1;
      const nextIndex = (lightbox.index + delta + total) % total;
      setLightbox({ url: photoUrls[nextIndex], index: nextIndex });
    },
    [lightbox, photoUrls]
  );

  const handleDownload = useCallback(() => {
    if (!lightbox) return;
    if (typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = lightbox.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = `product-request-${requestId ?? 'photo'}-${lightbox.index + 1}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [lightbox, requestId]);

  useEffect(() => {
    setLightbox(null);
  }, [photoUrls, requestId]);

  useEffect(() => {
    if (!lightbox) return;
    if (typeof window === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null);
      } else if (event.key === 'ArrowRight') {
        handleNavigate('next');
      } else if (event.key === 'ArrowLeft') {
        handleNavigate('prev');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNavigate, lightbox]);

  if (photoUrls.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Photos</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            {photoUrls.length} upload{photoUrls.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => openLightbox(0)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-primary hover:text-primary"
          >
            <Gallery size={14} /> Open viewer
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {photoUrls.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => openLightbox(index)}
            className="group relative block h-32 overflow-hidden rounded-xl border border-gray-200"
          >
            <Image
              src={url}
              alt={`Attachment ${index + 1}`}
              fill
              className="object-cover transition group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 200px"
            />
            <span className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 text-[10px] text-white">Click to preview</span>
          </button>
        ))}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="absolute inset-0" onClick={closeLightbox} />
          {photoUrls.length > 1 && (
            <>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleNavigate('prev');
                }}
                className="relative z-10 mr-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
              >
                ‹
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleNavigate('next');
                }}
                className="relative z-10 ml-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
              >
                ›
              </button>
            </>
          )}
          <div className="relative z-10 w-full max-w-4xl">
            <div className="relative h-[70vh] w-full overflow-hidden rounded-2xl bg-black/40">
              <Image src={lightbox.url} alt={`Product request photo ${lightbox.index + 1}`} fill className="object-contain" sizes="100vw" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-white/90">
              <span>
                Photo {lightbox.index + 1} of {photoUrls.length}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleDownload} className="rounded-full border border-white/40 px-4 py-1 text-xs font-semibold uppercase tracking-wide">
                  Download
                </button>
                <button onClick={closeLightbox} className="rounded-full border border-white/40 px-4 py-1 text-xs font-semibold uppercase tracking-wide">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

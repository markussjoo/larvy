'use client';
import { useEffect, useRef, useState } from 'react';
import { getImmediateDemoFileUrl, readDemoFile } from './lesson-files';
import type { LessonMedia } from './lesson-format';

function parseExternalEmbed(rawUrl: string): {
  embedType: 'iframe' | 'audio' | 'video' | 'link';
  src: string;
  provider?: string;
} {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname;

    // 1. YouTube
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) {
        return { embedType: 'iframe', src: `https://www.youtube.com/embed/${v}?autoplay=1`, provider: 'YouTube' };
      }
      const shortMatch = path.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,20})/);
      if (shortMatch) {
        return { embedType: 'iframe', src: `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1`, provider: 'YouTube' };
      }
    }
    if (host === 'youtu.be') {
      const id = path.slice(1).split('/')[0];
      if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
        return { embedType: 'iframe', src: `https://www.youtube.com/embed/${id}?autoplay=1`, provider: 'YouTube' };
      }
    }

    // 2. Vimeo
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = path.match(/\/(?:video\/)?(\d+)/);
      if (m) {
        return { embedType: 'iframe', src: `https://player.vimeo.com/video/${m[1]}?autoplay=1`, provider: 'Vimeo' };
      }
    }

    // 3. SoundCloud
    if (host === 'soundcloud.com') {
      return {
        embedType: 'iframe',
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(rawUrl)}&color=%237c3aed&auto_play=true`,
        provider: 'SoundCloud'
      };
    }

    // 4. Spotify (track, episode, show, playlist)
    if (host === 'open.spotify.com') {
      const m = path.match(/^\/(track|episode|show|playlist|album)\/([a-zA-Z0-9]+)/);
      if (m) {
        return {
          embedType: 'iframe',
          src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
          provider: 'Spotify'
        };
      }
    }

    // 5. Sveriges Radio
    if (host === 'sverigesradio.se') {
      const m = path.match(/\/avsnitt\/(\d+)/) || path.match(/\/artikel\/(\d+)/);
      if (m) {
        return {
          embedType: 'iframe',
          src: `https://sverigesradio.se/embed/publication/${m[1]}`,
          provider: 'Sveriges Radio'
        };
      }
    }

    // 6. Direct audio or video files by extension
    if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(path)) {
      return { embedType: 'audio', src: rawUrl };
    }
    if (/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(path)) {
      return { embedType: 'video', src: rawUrl };
    }

    return { embedType: 'link', src: rawUrl };
  } catch {
    return { embedType: 'link', src: rawUrl };
  }
}

export default function LessonMediaPlayer({ media }: { media: LessonMedia }) {
  const [blobUrl, setBlobUrl] = useState(() => (media.file ? getImmediateDemoFileUrl(media.file.id) : ''));
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!media.file) {
      setBlobUrl('');
      setError('');
      return;
    }
    const immediate = getImmediateDemoFileUrl(media.file.id);
    if (immediate) {
      setBlobUrl(immediate);
      setError('');
      return;
    }
    let disposed = false;
    setError('');
    readDemoFile(media.file.id).then(
      () => {
        if (disposed) return;
        const resolvedUrl = getImmediateDemoFileUrl(media.file!.id);
        if (resolvedUrl) {
          setBlobUrl(resolvedUrl);
        } else if (!media.file?.demo) {
          setBlobUrl('/api/lesson-files/' + media.file!.id);
        }
      },
      e => {
        if (disposed) return;
        if (!media.file?.demo) {
          setBlobUrl('/api/lesson-files/' + media.file!.id);
        } else {
          setError(e instanceof Error ? e.message : 'Mediafilen kunde inte laddas.');
        }
      }
    );
    return () => {
      disposed = true;
    };
  }, [media.file?.id, media.file?.demo]);

  const fileSrc = media.file
    ? blobUrl || getImmediateDemoFileUrl(media.file.id) || (!media.file.demo ? '/api/lesson-files/' + media.file.id : '')
    : media.url || '';

  useEffect(() => {
    if (!open || !fileSrc) return;
    if (media.file) {
      if (media.kind === 'video') {
        videoRef.current?.play().catch(() => {});
      } else {
        audioRef.current?.play().catch(() => {});
      }
    }
  }, [open, fileSrc, media.file, media.kind]);

  return (
    <span className="lesson-media-inline-wrapper" style={{ display: 'inline-block', verticalAlign: 'middle', margin: '4px 6px' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={open ? 'Stäng uppspelning' : `Spela upp: ${media.title}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 13px',
          borderRadius: 999,
          border: '1px solid #8b5cf6',
          background: open ? 'linear-gradient(110deg, #7c3aed, #4f46e5)' : 'rgba(124, 58, 237, 0.14)',
          color: open ? '#ffffff' : '#c4b5fd',
          fontWeight: 600,
          fontSize: 13,
          lineHeight: 1.2,
          cursor: 'pointer',
          boxShadow: open ? '0 3px 12px rgba(124, 58, 237, 0.32)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        {media.kind === 'audio' && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
        {media.kind === 'video' && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="18" rx="2.5" />
            <polygon points="10 9 15 12 10 15 10 9" fill="currentColor" />
          </svg>
        )}
        {media.kind === 'embed' && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
        <span>{media.title}</span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>{open ? '▲' : '▶'}</span>
      </button>

      {open && (
        <span
          className="lesson-media-popover"
          style={{
            display: 'block',
            marginTop: 8,
            marginBottom: 8,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(139, 92, 246, 0.35)',
            background: 'rgba(15, 23, 42, 0.92)',
            minWidth: 300,
            maxWidth: 560,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: '#e2e8f0' }}>{media.title}</strong>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {media.url && (
                <a
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#a78bfa', textDecoration: 'underline' }}
                >
                  Öppna i ny flik ↗
                </a>
              )}
              <button
                type="button"
                className="light"
                onClick={() => setOpen(false)}
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                Stäng ✕
              </button>
            </span>
          </span>

          {media.file ? (
            !fileSrc && !error ? (
              <span className="muted" style={{ display: 'block', margin: 0, fontSize: 12 }}>
                Förbereder {media.kind === 'video' ? 'filmspår' : 'ljudspår'}…
              </span>
            ) : media.kind === 'video' ? (
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                preload="auto"
                src={fileSrc}
                style={{ width: '100%', minWidth: 280, maxHeight: 380, borderRadius: 8, background: '#000', display: 'block' }}
              >
                Din webbläsare stödjer inte videouppspelning.
              </video>
            ) : (
              <audio
                ref={audioRef}
                controls
                autoPlay
                preload="auto"
                src={fileSrc}
                style={{ width: '100%', minWidth: 280, minHeight: 42, display: 'block' }}
              >
                Din webbläsare stödjer inte ljuduppspelning.
              </audio>
            )
          ) : media.url ? (() => {
            const parsed = parseExternalEmbed(media.url);
            if (parsed.embedType === 'audio' || (media.kind === 'audio' && parsed.embedType !== 'iframe')) {
              return (
                <audio controls autoPlay preload="auto" src={parsed.src} style={{ width: '100%', minWidth: 280, minHeight: 42, display: 'block' }} />
              );
            }
            if (parsed.embedType === 'video') {
              return (
                <video controls autoPlay playsInline preload="auto" src={parsed.src} style={{ width: '100%', minWidth: 280, maxHeight: 380, borderRadius: 8, background: '#000', display: 'block' }} />
              );
            }
            const isAudioEmbed = media.kind === 'audio' || parsed.provider === 'SoundCloud' || parsed.provider === 'Spotify' || parsed.provider === 'Sveriges Radio';
            return (
              <span style={{ display: 'block', width: '100%', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                <iframe
                  src={parsed.src}
                  title={media.title}
                  width="100%"
                  height={isAudioEmbed ? '166' : '320'}
                  style={{ border: 0, display: 'block' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </span>
            );
          })() : null}

          {error && <span role="alert" className="error" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>{error}</span>}
        </span>
      )}
    </span>
  );
}

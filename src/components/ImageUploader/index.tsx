'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, X, Star, Image as ImageIcon, Loader2, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: 'uploading' | 'done' | 'error';
  error?: string;
}

function isLocalPath(src: string) {
  return src.startsWith('/uploads/');
}

function Thumbnail({
  src,
  index,
  isMain,
  onRemove,
  onSetMain,
  disabled,
}: {
  src: string;
  index: number;
  isMain: boolean;
  onRemove: () => void;
  onSetMain: () => void;
  disabled?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={cn(
      'relative group rounded-xl overflow-hidden border-2 aspect-square bg-gray-50',
      isMain ? 'border-indigo-400' : 'border-gray-200 hover:border-gray-300'
    )}>
      {imgError ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
          <ImageIcon size={20} className="text-gray-300" />
          <p className="text-xs text-gray-400 text-center break-all leading-tight">
            {isLocalPath(src) ? 'Imagen local' : src.slice(0, 30)}
          </p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Imagen ${index + 1}`}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      )}

      {/* Main badge */}
      {isMain && (
        <div className="absolute top-1 left-1 bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1">
          <Star size={9} fill="currentColor" />
          Principal
        </div>
      )}

      {/* Overlay actions */}
      {!disabled && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {!isMain && (
            <button
              onClick={onSetMain}
              title="Marcar como imagen principal"
              className="bg-white/90 hover:bg-white text-gray-800 rounded-lg px-2 py-1 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Star size={10} />
              Principal
            </button>
          )}
          <button
            onClick={onRemove}
            title="Eliminar imagen"
            className="bg-red-500/90 hover:bg-red-600 text-white rounded-lg p-1.5 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ImageUploader({ images, onChange, disabled }: ImageUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Error al subir imagen', 'error');
        return null;
      }
      const { url } = await res.json();
      return url as string;
    } catch {
      toast('Error de red al subir imagen', 'error');
      return null;
    }
  }, [toast]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    const ids = fileArr.map(() => Math.random().toString(36).slice(2));
    setUploading((prev) => [
      ...prev,
      ...fileArr.map((f, i) => ({ id: ids[i], name: f.name, progress: 'uploading' as const })),
    ]);

    const results = await Promise.all(fileArr.map((f) => uploadFile(f)));

    const succeeded = results.filter((r): r is string => r !== null);
    setUploading((prev) => prev.filter((u) => !ids.includes(u.id)));

    if (succeeded.length > 0) {
      onChange([...images, ...succeeded]);
    }
  }, [images, onChange, uploadFile]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  }

  function handleRemove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function handleSetMain(index: number) {
    if (index === 0) return;
    const reordered = [images[index], ...images.filter((_, i) => i !== index)];
    onChange(reordered);
  }

  function handleAddUrl() {
    const url = urlInput.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast('La URL debe empezar con http:// o https://', 'error');
      return;
    }
    onChange([...images, url]);
    setUrlInput('');
    setShowUrlInput(false);
  }

  const isUploading = uploading.length > 0;

  return (
    <div className="space-y-3">
      {/* Thumbnails grid */}
      {(images.length > 0 || uploading.length > 0) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((src, i) => (
            <Thumbnail
              key={src + i}
              src={src}
              index={i}
              isMain={i === 0}
              onRemove={() => handleRemove(i)}
              onSetMain={() => handleSetMain(i)}
              disabled={disabled}
            />
          ))}
          {/* Uploading placeholders */}
          {uploading.map((u) => (
            <div
              key={u.id}
              className="relative rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 aspect-square flex flex-col items-center justify-center gap-1"
            >
              <Loader2 size={16} className="text-indigo-400 animate-spin" />
              <p className="text-xs text-indigo-400 text-center px-1 truncate w-full text-center">
                {u.name}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / upload area */}
      {!disabled && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none',
            dragging
              ? 'border-indigo-400 bg-indigo-50 scale-[1.01]'
              : isUploading
              ? 'border-indigo-300 bg-indigo-50/50 cursor-wait'
              : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={handleInputChange}
          />
          {isUploading ? (
            <Loader2 size={20} className="text-indigo-400 animate-spin" />
          ) : (
            <Upload size={20} className={dragging ? 'text-indigo-500' : 'text-gray-400'} />
          )}
          <div className="text-center">
            <p className={cn('text-sm font-medium', dragging ? 'text-indigo-600' : 'text-gray-600')}>
              {isUploading ? 'Subiendo...' : dragging ? 'Soltá para subir' : 'Arrastrá fotos acá o hacé clic'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG o WebP · Máximo 5 MB</p>
          </div>
        </div>
      )}

      {/* URL input toggle */}
      {!disabled && (
        <div>
          {showUrlInput ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); if (e.key === 'Escape') setShowUrlInput(false); }}
                placeholder="https://..."
                autoFocus
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
              />
              <button
                onClick={handleAddUrl}
                disabled={!urlInput.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium disabled:opacity-40 transition-colors"
              >
                Agregar
              </button>
              <button
                onClick={() => { setShowUrlInput(false); setUrlInput(''); }}
                className="px-3 py-2 border border-gray-200 text-gray-500 hover:text-gray-700 text-sm rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowUrlInput(true); }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
            >
              <LinkIcon size={12} />
              Agregar por URL
            </button>
          )}
        </div>
      )}

      {/* Count hint */}
      <p className={cn('text-xs', images.length === 0 ? 'text-red-500' : 'text-gray-400')}>
        {images.length === 0
          ? 'Al menos 1 foto requerida para publicar'
          : `${images.length} foto${images.length !== 1 ? 's' : ''} · La primera es la imagen principal`}
      </p>
    </div>
  );
}

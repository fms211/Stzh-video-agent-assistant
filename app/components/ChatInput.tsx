"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Plus, ArrowUp } from "lucide-react";
import { PluginSlot } from "./plugin-slots/PluginSlot";

type Props = {
  onSubmit: (text: string, files: File[]) => boolean | void;
  disabled?: boolean;
  onFilesAdded?: (files: File[]) => void;
  externalFiles?: File[];
  fillText?: string;
  onTextChange?: (value: string) => void;
};

export default function ChatInput({ onSubmit, disabled, onFilesAdded, externalFiles, fillText, onTextChange }: Props) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const manualEditRef = useRef(false);
  const composingRef = useRef(false);
  const canSend = (value.trim().length > 0 || files.length > 0) && !disabled;

  useEffect(() => {
    if (fillText !== undefined && fillText !== value) {
      setValue(fillText);
      manualEditRef.current = false;
    }
    // value 只用于避免重复写入；外部草稿才是跨模式恢复来源。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillText]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    manualEditRef.current = true;
    setValue(e.target.value);
    onTextChange?.(e.target.value);
  };

  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      setFiles((prev) => [...prev, ...externalFiles]);
    }
  }, [externalFiles]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    onFilesAdded?.(selected);
    e.target.value = "";
  };

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = () => {
    if (!canSend) return;
    const accepted = onSubmit(value.trim(), files);
    if (accepted === false) return;
    setValue("");
    onTextChange?.("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-input-anchor edge-glow edge-glow-subtle">
      {/* 插件槽位：chat.composer.actions（additive，Mock 阶段无贡献时不渲染） */}
      <PluginSlot slot="chat.composer.actions" contributions={[]} projectId="project-a" />
      {files.length > 0 && (
        <div className="chat-file-preview">
          {files.map((f, i) => (
            <span key={f.name + i} className="chat-file-chip">
              {f.name}
              <button onClick={() => removeFile(i)} aria-label={`移除 ${f.name}`}>
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="chat-input-capsule">
        <button
          type="button"
          className="chat-input-file-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="上传文件"
          title="上传文件"
        >
          <Plus size={16} strokeWidth={1.8} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx,.xlsx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={handleFiles}
        />
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          rows={1}
          value={value}
          onChange={(e) => {
            handleChange(e);
            resizeTextarea();
          }}
        onKeyDown={onKeyDown}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
          placeholder="描述你想生成的视频，或上传参考文件..."
          disabled={disabled}
        />
        <button
          type="button"
          className="chat-input-send-btn"
          onClick={send}
          disabled={!canSend}
          aria-label="发送"
        >
          <ArrowUp size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

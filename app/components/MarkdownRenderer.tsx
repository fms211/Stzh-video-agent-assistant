"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight, rehypeSanitize]}
      components={{
        // 代码块样式
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match;
          if (isInline) {
            return (
              <code className="md-inline-code" {...props}>
                {children}
              </code>
            );
          }
          return (
            <div className="md-code-block">
              <div className="md-code-header">
                <span className="md-code-lang">{match?.[1] || "code"}</span>
              </div>
              <pre>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
          );
        },
        // 链接新窗口打开
        a({ children, href, ...props }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          );
        },
        // 表格
        table({ children, ...props }) {
          return (
            <div className="md-table-wrap">
              <table {...props}>{children}</table>
            </div>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );
}

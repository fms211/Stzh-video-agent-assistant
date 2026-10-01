"use client";

import { useState, type RefObject } from "react";
import { ChevronDown, X } from "lucide-react";
import { IMG_PARAM_CATEGORIES } from "@/app/data/opc-knowledge";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

type Props = {
  selectedParams: string[];
  onSelectedParamsChange: (selectedParams: string[]) => void;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  isOverlay: boolean;
};

export function CreativeImageParameterDrawer({
  selectedParams,
  onSelectedParamsChange,
  onClose,
  closeButtonRef,
  isOverlay,
}: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(() => new Set<number>());

  const toggleCategory = (index: number) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleValue = (value: string) => {
    onSelectedParamsChange(
      selectedParams.includes(value)
        ? selectedParams.filter((item) => item !== value)
        : [...selectedParams, value],
    );
  };

  return (
    <div
      id="creative-image-parameter-drawer"
      className="cws-image-parameter-drawer"
      role={isOverlay ? "dialog" : "complementary"}
      aria-modal={isOverlay ? true : undefined}
      aria-label="图像参数"
    >
      <LiquidGlassSurface variant="panel" className="cws-image-parameter-drawer__surface">
      <header className="cws-image-parameter-drawer__head">
        <div>
          <strong>图像参数</strong>
          <span>已选 {selectedParams.length} 项</span>
        </div>
        <div className="cws-image-parameter-drawer__actions">
          <button
            type="button"
            className="cws-image-parameter-drawer__clear"
            disabled={selectedParams.length === 0}
            onClick={() => onSelectedParamsChange([])}
          >
            清除全部
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className="cws-image-parameter-drawer__close"
            aria-label="关闭图像参数"
            onClick={onClose}
          >
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      </header>

        <div className="cws-image-parameter-drawer__body">
        {IMG_PARAM_CATEGORIES.map((category, index) => {
          const expanded = expandedCategories.has(index);
          const valueCount = category.items.flatMap((item) => item.values).length;
          const contentId = `creative-image-parameter-category-${index}`;

          return (
            <section key={category.label} className="cws-image-parameter-category">
              <button
                type="button"
                className="cws-image-parameter-category__trigger"
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={() => toggleCategory(index)}
              >
                <span className="cws-image-parameter-category__name">
                  <span aria-hidden="true">{category.icon}</span>
                  {category.label}
                </span>
                <span className="cws-image-parameter-category__meta">{valueCount} 个值</span>
                <ChevronDown aria-hidden="true" size={14} />
              </button>

              {expandedCategories.has(index) && (
                <div id={contentId} className="cws-image-parameter-category__content">
                  {category.items.map((item) => (
                    <div key={item.key} className="cws-image-parameter-row">
                      <span>{item.label}</span>
                      <div className="cws-image-parameter-row__values">
                        {item.values.map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={selectedParams.includes(value) ? "is-active" : ""}
                            aria-pressed={selectedParams.includes(value)}
                            onClick={() => toggleValue(value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        </div>
      </LiquidGlassSurface>
    </div>
  );
}

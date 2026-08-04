// 新拟态底部弹窗组件 — 凸起面板 + 拖拽手柄 + 渐变遮罩
// 用于工作流选择、确认对话框等

import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;
  style?: ViewStyle;
}

export function NeuModal({ visible, onClose, title, children, maxHeight = '80%', style }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.panel, { maxHeight: maxHeight as any }, style]}>
          {/* 面板顶部高光 */}
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.panelHighlight}
          />
          {/* 面板内边框 */}
          <View style={styles.panelBorder} />

          {/* 拖拽手柄 */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* 标题 */}
          {title && (
            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 内容 */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface ItemProps {
  label: string;
  description?: string;
  icon?: string;
  onPress: () => void;
  active?: boolean;
}

export function NeuModalItem({ label, description, icon, onPress, active }: ItemProps) {
  return (
    <TouchableOpacity
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* 凸起效果 */}
      <LinearGradient
        colors={active
          ? ['rgba(232,152,64,0.15)', 'rgba(232,152,64,0.05)']
          : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.itemGradient}
      />
      <View style={styles.itemContent}>
        {icon && <Text style={styles.itemIcon}>{icon}</Text>}
        <View style={styles.itemTexts}>
          <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{label}</Text>
          {description && <Text style={styles.itemDesc}>{description}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  panel: {
    backgroundColor: '#0f1a35',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  panelHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  panelBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 0,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.safeArea,
  },

  // === Modal Item ===
  item: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  itemActive: {
    // handled by gradient
  },
  itemGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  itemIcon: {
    fontSize: 24,
  },
  itemTexts: {
    flex: 1,
  },
  itemLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.onSurface,
  },
  itemLabelActive: {
    color: Colors.primary,
  },
  itemDesc: {
    fontSize: FontSize.sm,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});

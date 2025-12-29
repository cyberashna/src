import React, { createContext, useContext, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type DragItem = {
  type: 'habit' | 'block';
  id: string;
  label: string;
  themeName?: string;
} | null;

type DragDropContextType = {
  dragItem: DragItem;
  isDragging: boolean;
  startDrag: (item: DragItem) => void;
  endDrag: () => void;
  updateDragPosition: (x: number, y: number) => void;
  dragPosition: { x: number; y: number };
};

const DragDropContext = createContext<DragDropContextType | undefined>(undefined);

export const useDragDrop = () => {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within DragDropProvider');
  }
  return context;
};

export const DragDropProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const startDrag = (item: DragItem) => {
    setDragItem(item);
  };

  const endDrag = () => {
    setDragItem(null);
  };

  const updateDragPosition = (x: number, y: number) => {
    setDragPosition({ x, y });
  };

  const isDragging = dragItem !== null;

  return (
    <DragDropContext.Provider
      value={{
        dragItem,
        isDragging,
        startDrag,
        endDrag,
        updateDragPosition,
        dragPosition,
      }}
    >
      {children}
      {isDragging && dragItem && (
        <View
          style={[
            styles.dragOverlay,
            {
              left: dragPosition.x - 50,
              top: dragPosition.y - 25,
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.dragPreview}>
            <Text style={styles.dragText} numberOfLines={2}>
              {dragItem.label}
            </Text>
            {dragItem.themeName && (
              <Text style={styles.dragTheme}>#{dragItem.themeName}</Text>
            )}
          </View>
        </View>
      )}
    </DragDropContext.Provider>
  );
};

const styles = StyleSheet.create({
  dragOverlay: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 10,
  },
  dragPreview: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    minWidth: 100,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dragText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dragTheme: {
    color: '#fff',
    fontSize: 10,
    marginTop: 4,
    opacity: 0.8,
  },
});

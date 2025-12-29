import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useDragDrop } from '../context/DragDropContext';

type DroppableProps = {
  children: React.ReactNode;
  onDrop: (item: { type: 'habit' | 'block'; id: string }) => void;
  style?: any;
};

export const Droppable: React.FC<DroppableProps> = ({ children, onDrop, style }) => {
  const { dragItem, isDragging, dragPosition, endDrag } = useDragDrop();
  const [isOver, setIsOver] = useState(false);
  const viewRef = useRef<View>(null);
  const layoutRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.measure((x, y, width, height, pageX, pageY) => {
        layoutRef.current = { x: pageX, y: pageY, width, height };
      });
    }
  }, []);

  useEffect(() => {
    if (!isDragging) {
      if (isOver && dragItem) {
        onDrop({ type: dragItem.type, id: dragItem.id });
      }
      setIsOver(false);
      return;
    }

    const layout = layoutRef.current;
    const isInside =
      dragPosition.x >= layout.x &&
      dragPosition.x <= layout.x + layout.width &&
      dragPosition.y >= layout.y &&
      dragPosition.y <= layout.y + layout.height;

    setIsOver(isInside);
  }, [isDragging, dragPosition, dragItem]);

  return (
    <View
      ref={viewRef}
      style={[style, isOver && styles.dropZoneActive]}
      onLayout={() => {
        if (viewRef.current) {
          viewRef.current.measure((x, y, width, height, pageX, pageY) => {
            layoutRef.current = { x: pageX, y: pageY, width, height };
          });
        }
      }}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  dropZoneActive: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
  },
});

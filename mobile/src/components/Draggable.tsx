import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDragDrop } from '../context/DragDropContext';

type DraggableProps = {
  children: React.ReactNode;
  item: {
    type: 'habit' | 'block';
    id: string;
    label: string;
    themeName?: string;
  };
  style?: any;
};

export const Draggable: React.FC<DraggableProps> = ({ children, item, style }) => {
  const { startDrag, endDrag, updateDragPosition } = useDragDrop();
  const viewRef = useRef<View>(null);

  const panGesture = Gesture.Pan()
    .onBegin((event) => {
      updateDragPosition(event.absoluteX, event.absoluteY);
      startDrag(item);
    })
    .onUpdate((event) => {
      updateDragPosition(event.absoluteX, event.absoluteY);
    })
    .onEnd(() => {
      endDrag();
    })
    .onFinalize(() => {
      endDrag();
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View ref={viewRef} style={style}>
        {children}
      </View>
    </GestureDetector>
  );
};

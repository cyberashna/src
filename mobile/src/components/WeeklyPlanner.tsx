import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Block, ViewMode } from '../types';
import { Droppable } from './Droppable';

type WeeklyPlannerProps = {
  blocks: Block[];
  viewMode: ViewMode;
  bucketSlots: string[];
  onViewModeChange: (mode: ViewMode) => void;
  onBlockTap: (blockId: string) => void;
  onDrop: (item: { type: 'habit' | 'block'; id: string }, dayIndex: number, timeIndex: number) => void;
  onToggleCompletion: (blockId: string) => void;
};

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const hourlySlots = [
  '6:00 AM',
  '7:00 AM',
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
  '10:00 PM',
];

export const WeeklyPlanner: React.FC<WeeklyPlannerProps> = ({
  blocks,
  viewMode,
  bucketSlots,
  onViewModeChange,
  onBlockTap,
  onDrop,
  onToggleCompletion,
}) => {
  const slotLabels = viewMode === 'hourly' ? hourlySlots : bucketSlots;

  const getBlocksForSlot = (dayIndex: number, timeIndex: number) => {
    return blocks.filter(
      (b) =>
        b.location_type === 'slot' &&
        b.day_index === dayIndex &&
        b.time_index === timeIndex
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Planner</Text>
      </View>

      <View style={styles.viewToggle}>
        <Text style={styles.label}>View:</Text>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'hourly' && styles.toggleButtonActive,
          ]}
          onPress={() => onViewModeChange('hourly')}
        >
          <Text
            style={[
              styles.toggleText,
              viewMode === 'hourly' && styles.toggleTextActive,
            ]}
          >
            Hourly
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'buckets' && styles.toggleButtonActive,
          ]}
          onPress={() => onViewModeChange('buckets')}
        >
          <Text
            style={[
              styles.toggleText,
              viewMode === 'buckets' && styles.toggleTextActive,
            ]}
          >
            Buckets
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.description}>
        Drag habits or blocks from the left into time slots to schedule them. Tap
        blocks to toggle completion or remove them.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          <View style={styles.headerRow}>
            <View style={styles.timeHeaderCell}>
              <Text style={styles.headerText}>Time</Text>
            </View>
            {days.map((day) => (
              <View key={day} style={styles.dayHeaderCell}>
                <Text style={styles.headerText}>{day}</Text>
              </View>
            ))}
          </View>

          <ScrollView style={styles.gridScroll}>
            {slotLabels.map((slotLabel, timeIndex) => (
              <View key={`${slotLabel}-${timeIndex}`} style={styles.row}>
                <View style={styles.timeCell}>
                  <Text style={styles.timeText}>{slotLabel}</Text>
                </View>
                {days.map((_, dayIndex) => {
                  const slotBlocks = getBlocksForSlot(dayIndex, timeIndex);
                  return (
                    <Droppable
                      key={`${dayIndex}-${timeIndex}`}
                      onDrop={(item) => onDrop(item, dayIndex, timeIndex)}
                      style={styles.slotCell}
                    >
                      {slotBlocks.map((block) => (
                        <TouchableOpacity
                          key={block.id}
                          style={[
                            styles.block,
                            block.is_habit_block && styles.habitBlock,
                            block.completed && styles.blockDone,
                          ]}
                          onPress={() => {
                            if (block.is_habit_block) {
                              onToggleCompletion(block.id);
                            } else {
                              onBlockTap(block.id);
                            }
                          }}
                        >
                          <Text style={styles.blockText} numberOfLines={2}>
                            {block.label}
                          </Text>
                          {block.hashtag && (
                            <Text style={styles.hashtagText}>
                              #{block.hashtag}
                            </Text>
                          )}
                          {block.is_habit_block && block.completed && (
                            <Text style={styles.checkmark}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </Droppable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  toggleButtonActive: {
    backgroundColor: '#2196F3',
  },
  toggleText: {
    fontSize: 14,
    color: '#333',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    lineHeight: 16,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#ddd',
  },
  timeHeaderCell: {
    width: 80,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  dayHeaderCell: {
    width: 100,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderLeftWidth: 1,
    borderLeftColor: '#ddd',
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  gridScroll: {
    maxHeight: 500,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  timeCell: {
    width: 80,
    padding: 8,
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  timeText: {
    fontSize: 11,
    color: '#666',
  },
  slotCell: {
    width: 100,
    minHeight: 60,
    padding: 4,
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  block: {
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
    padding: 6,
    marginBottom: 4,
  },
  habitBlock: {
    backgroundColor: '#FFF9C4',
  },
  blockDone: {
    opacity: 0.5,
    backgroundColor: '#C8E6C9',
  },
  blockText: {
    fontSize: 11,
    color: '#333',
  },
  hashtagText: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  checkmark: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
});

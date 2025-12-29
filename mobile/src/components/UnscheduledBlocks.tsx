import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native';
import { Block } from '../types';

type UnscheduledBlocksProps = {
  blocks: Block[];
  onCreateBlock: (label: string, hashtag?: string) => void;
  onBlockLongPress: (blockId: string) => void;
};

export const UnscheduledBlocks: React.FC<UnscheduledBlocksProps> = ({
  blocks,
  onCreateBlock,
  onBlockLongPress,
}) => {
  const [blockLabel, setBlockLabel] = useState('');
  const [blockHashtag, setBlockHashtag] = useState('');

  const handleCreate = () => {
    if (blockLabel.trim()) {
      onCreateBlock(
        blockLabel.trim(),
        blockHashtag.trim() || undefined
      );
      setBlockLabel('');
      setBlockHashtag('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unscheduled blocks</Text>
      <Text style={styles.description}>
        Create generic blocks (tasks, one-off plans), then long-press to drag them
        into the weekly planner. For habits, long-press directly from the habit list.
      </Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={blockLabel}
          onChangeText={setBlockLabel}
          placeholder="e.g. Deep clean bathroom"
        />
        <TextInput
          style={[styles.input, styles.inputSmall]}
          value={blockHashtag}
          onChangeText={setBlockHashtag}
          placeholder="Hashtag (optional)"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
          <Text style={styles.addButtonText}>Add block</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.blockList} horizontal showsHorizontalScrollIndicator={false}>
        {blocks.map((block) => (
          <TouchableOpacity
            key={block.id}
            style={[
              styles.block,
              block.is_habit_block && styles.habitBlock,
              block.completed && styles.blockDone,
            ]}
            onLongPress={() => onBlockLongPress(block.id)}
            delayLongPress={500}
          >
            <Text style={styles.blockText}>{block.label}</Text>
            {block.hashtag && (
              <Text style={styles.hashtagText}>#{block.hashtag}</Text>
            )}
          </TouchableOpacity>
        ))}
        {blocks.length === 0 && (
          <Text style={styles.emptyText}>No unscheduled blocks yet.</Text>
        )}
      </ScrollView>

      <Text style={styles.hint}>
        Tap a regular block in the grid to send it back here. Habit blocks are
        deleted on tap.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  inputSmall: {
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  blockList: {
    marginVertical: 12,
    maxHeight: 120,
  },
  block: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    padding: 12,
    marginRight: 8,
    minWidth: 120,
    maxWidth: 200,
  },
  habitBlock: {
    backgroundColor: '#FFF9C4',
  },
  blockDone: {
    opacity: 0.5,
  },
  blockText: {
    fontSize: 14,
    color: '#333',
  },
  hashtagText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    lineHeight: 16,
  },
});

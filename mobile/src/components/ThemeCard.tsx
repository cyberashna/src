import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Theme, Habit } from '../types';

type ThemeCardProps = {
  theme: Theme;
  habits: Habit[];
  onAddHabit: (
    themeId: string,
    name: string,
    target: number,
    frequency: 'weekly' | 'monthly' | 'none'
  ) => void;
  onIncrementHabit: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  onHabitLongPress: (habitId: string) => void;
};

export const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  habits,
  onAddHabit,
  onIncrementHabit,
  onDeleteHabit,
  onHabitLongPress,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [habitName, setHabitName] = useState('');
  const [target, setTarget] = useState('2');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'none'>('weekly');

  const handleSave = () => {
    if (habitName.trim()) {
      onAddHabit(theme.id, habitName.trim(), parseInt(target) || 2, frequency);
      setHabitName('');
      setTarget('2');
      setFrequency('weekly');
      setIsAdding(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.themeName}>{theme.name}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setIsAdding(true)}
        >
          <Text style={styles.addButtonText}>Add habit</Text>
        </TouchableOpacity>
      </View>

      {habits.length === 0 && !isAdding && (
        <Text style={styles.emptyText}>No habits yet in this theme.</Text>
      )}

      {habits.map((habit) => (
        <View key={habit.id} style={styles.habitItem}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDeleteHabit(habit.id)}
          >
            <Text style={styles.deleteText}>×</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.habitMain}
            onLongPress={() => onHabitLongPress(habit.id)}
            delayLongPress={500}
          >
            <Text style={styles.habitName}>{habit.name}</Text>
            <Text style={styles.habitMeta}>
              {habit.frequency === 'none'
                ? 'No target'
                : `Target: ${habit.target_per_week} / ${habit.frequency}`}
            </Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Done: {habit.done_count}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => onIncrementHabit(habit.id)}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      ))}

      {isAdding && (
        <View style={styles.addForm}>
          <Text style={styles.label}>Habit name</Text>
          <TextInput
            style={styles.input}
            value={habitName}
            onChangeText={setHabitName}
            placeholder="e.g. Clean kitchen"
          />

          <Text style={styles.label}>Frequency</Text>
          <View style={styles.frequencyButtons}>
            {(['weekly', 'monthly', 'none'] as const).map((freq) => (
              <TouchableOpacity
                key={freq}
                style={[
                  styles.frequencyButton,
                  frequency === freq && styles.frequencyButtonActive,
                ]}
                onPress={() => setFrequency(freq)}
              >
                <Text
                  style={[
                    styles.frequencyButtonText,
                    frequency === freq && styles.frequencyButtonTextActive,
                  ]}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {frequency !== 'none' && (
            <>
              <Text style={styles.label}>Target</Text>
              <TextInput
                style={styles.input}
                value={target}
                onChangeText={setTarget}
                keyboardType="numeric"
              />
            </>
          )}

          <View style={styles.formButtons}>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save habit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIsAdding(false);
                setHabitName('');
                setTarget('2');
                setFrequency('weekly');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  themeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  addButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  addButtonText: {
    fontSize: 12,
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  habitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  deleteText: {
    fontSize: 24,
    color: '#999',
  },
  habitMain: {
    flex: 1,
    paddingRight: 8,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  habitMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  pill: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 12,
    color: '#333',
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  addForm: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
  },
  frequencyButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  frequencyButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  frequencyButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  frequencyButtonText: {
    fontSize: 12,
    color: '#333',
  },
  frequencyButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 14,
  },
});

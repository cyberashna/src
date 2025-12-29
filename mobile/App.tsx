import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './src/lib/supabase';
import { databaseService } from './src/services/database';
import { Theme, Habit, Block, ViewMode } from './src/types';
import { AuthScreen } from './src/screens/AuthScreen';
import { ThemeCard } from './src/components/ThemeCard';
import { UnscheduledBlocks } from './src/components/UnscheduledBlocks';
import { WeeklyPlanner } from './src/components/WeeklyPlanner';
import { DragDropProvider } from './src/context/DragDropContext';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('hourly');
  const [bucketSlots, setBucketSlots] = useState<string[]>([
    'Early morning',
    'Morning',
    'Afternoon',
    'Evening',
    'Night',
  ]);
  const [newThemeName, setNewThemeName] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadData();
    }
  }, [session]);

  const loadData = async () => {
    if (!session?.user) return;

    try {
      const [themesData, habitsData, blocksData] = await Promise.all([
        databaseService.fetchThemes(session.user.id),
        databaseService.fetchHabits(session.user.id),
        databaseService.fetchBlocks(session.user.id),
      ]);

      setThemes(themesData);
      setHabits(habitsData);
      setBlocks(blocksData);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load data');
    }
  };

  const handleAddTheme = async () => {
    if (!session?.user || !newThemeName.trim()) {
      Alert.alert('Error', 'Please enter a theme name');
      return;
    }

    try {
      const newTheme = await databaseService.createTheme(
        session.user.id,
        newThemeName.trim()
      );
      setThemes((prev) => [...prev, newTheme]);
      setNewThemeName('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create theme');
    }
  };

  const handleAddHabit = async (
    themeId: string,
    name: string,
    target: number,
    frequency: 'weekly' | 'monthly' | 'none'
  ) => {
    if (!session?.user) return;

    try {
      const newHabit = await databaseService.createHabit(
        session.user.id,
        themeId,
        name,
        target,
        frequency
      );
      setHabits((prev) => [...prev, newHabit]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create habit');
    }
  };

  const handleIncrementHabit = async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;

    try {
      await databaseService.updateHabit(habitId, {
        done_count: habit.done_count + 1,
        last_done_at: new Date().toISOString(),
      });

      setHabits((prev) =>
        prev.map((h) =>
          h.id === habitId
            ? {
                ...h,
                done_count: h.done_count + 1,
                last_done_at: new Date().toISOString(),
              }
            : h
        )
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update habit');
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    Alert.alert(
      'Delete Habit',
      'Are you sure? Any linked habit blocks will become normal blocks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.deleteHabit(habitId);
              setHabits((prev) => prev.filter((h) => h.id !== habitId));

              const affectedBlocks = blocks.filter((b) => b.habit_id === habitId);
              for (const block of affectedBlocks) {
                await databaseService.updateBlock(block.id, {
                  is_habit_block: false,
                  habit_id: undefined,
                  completed: false,
                });
              }

              setBlocks((prev) =>
                prev.map((b) =>
                  b.habit_id === habitId
                    ? {
                        ...b,
                        is_habit_block: false,
                        habit_id: undefined,
                        completed: false,
                      }
                    : b
                )
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete habit');
            }
          },
        },
      ]
    );
  };

  const handleCreateBlock = async (label: string, hashtag?: string) => {
    if (!session?.user) return;

    try {
      const newBlock = await databaseService.createBlock(
        session.user.id,
        label,
        false,
        undefined,
        hashtag
      );
      setBlocks((prev) => [...prev, newBlock]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create block');
    }
  };

  const handleDrop = async (
    item: { type: 'habit' | 'block'; id: string },
    dayIndex: number,
    timeIndex: number
  ) => {
    if (!session?.user) return;

    try {
      if (item.type === 'habit') {
        const habit = habits.find((h) => h.id === item.id);
        if (!habit) return;

        const theme = themes.find((t) => t.id === habit.theme_id);
        const newBlock = await databaseService.createBlock(
          session.user.id,
          `Habit: ${habit.name}`,
          true,
          habit.id,
          theme?.name
        );

        await databaseService.updateBlock(newBlock.id, {
          location_type: 'slot',
          day_index: dayIndex,
          time_index: timeIndex,
        });

        setBlocks((prev) => [
          ...prev,
          {
            ...newBlock,
            location_type: 'slot',
            day_index: dayIndex,
            time_index: timeIndex,
          },
        ]);
      } else if (item.type === 'block') {
        await databaseService.updateBlock(item.id, {
          location_type: 'slot',
          day_index: dayIndex,
          time_index: timeIndex,
        });

        setBlocks((prev) =>
          prev.map((b) =>
            b.id === item.id
              ? {
                  ...b,
                  location_type: 'slot',
                  day_index: dayIndex,
                  time_index: timeIndex,
                }
              : b
          )
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to schedule item');
    }
  };

  const handleBlockTap = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    if (block.is_habit_block) {
      Alert.alert('Delete Block', 'Remove this habit block?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.deleteBlock(blockId);
              setBlocks((prev) => prev.filter((b) => b.id !== blockId));
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete block');
            }
          },
        },
      ]);
    } else {
      try {
        await databaseService.updateBlock(blockId, {
          location_type: 'unscheduled',
          day_index: undefined,
          time_index: undefined,
        });

        setBlocks((prev) =>
          prev.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  location_type: 'unscheduled',
                  day_index: undefined,
                  time_index: undefined,
                }
              : b
          )
        );
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to move block');
      }
    }
  };

  const handleToggleCompletion = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || !block.is_habit_block || !block.habit_id) return;

    const newCompleted = !block.completed;
    const habit = habits.find((h) => h.id === block.habit_id);
    if (!habit) return;

    try {
      await databaseService.updateBlock(blockId, { completed: newCompleted });

      const delta = newCompleted ? 1 : -1;
      const nextCount = Math.max(0, habit.done_count + delta);

      await databaseService.updateHabit(habit.id, {
        done_count: nextCount,
        ...(newCompleted && { last_done_at: new Date().toISOString() }),
      });

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, completed: newCompleted } : b
        )
      );

      setHabits((prev) =>
        prev.map((h) =>
          h.id === block.habit_id
            ? {
                ...h,
                done_count: nextCount,
                ...(newCompleted && { last_done_at: new Date().toISOString() }),
              }
            : h
        )
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to toggle completion');
    }
  };

  const handleResetWeek = async () => {
    if (!session?.user) return;

    Alert.alert(
      'Reset Week',
      'Reset all habit counts for a new week?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await databaseService.resetHabitsForNewWeek(session.user.id);
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to reset week');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setThemes([]);
    setHabits([]);
    setBlocks([]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen onAuthSuccess={() => {}} />;
  }

  const unscheduledBlocks = blocks.filter((b) => b.location_type === 'unscheduled');
  const scheduledBlocks = blocks.filter((b) => b.location_type === 'slot');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DragDropProvider>
        <View style={styles.container}>
          <StatusBar style="auto" />
          <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Habit Planner</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Habit Themes</Text>
            <TouchableOpacity style={styles.resetButton} onPress={handleResetWeek}>
              <Text style={styles.resetButtonText}>New week (reset)</Text>
            </TouchableOpacity>
          </View>

          {themes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              habits={habits.filter((h) => h.theme_id === theme.id)}
              onAddHabit={handleAddHabit}
              onIncrementHabit={handleIncrementHabit}
              onDeleteHabit={handleDeleteHabit}
            />
          ))}

          <View style={styles.addThemeContainer}>
            <Text style={styles.label}>Add a new theme</Text>
            <View style={styles.addThemeRow}>
              <TextInput
                style={styles.themeInput}
                value={newThemeName}
                onChangeText={setNewThemeName}
                placeholder="e.g. Spiritual, Social"
              />
              <TouchableOpacity style={styles.addThemeButton} onPress={handleAddTheme}>
                <Text style={styles.addThemeButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <UnscheduledBlocks
            blocks={unscheduledBlocks}
            onCreateBlock={handleCreateBlock}
          />
        </View>

        <View style={styles.section}>
          <WeeklyPlanner
            blocks={scheduledBlocks}
            viewMode={viewMode}
            bucketSlots={bucketSlots}
            onViewModeChange={setViewMode}
            onBlockTap={handleBlockTap}
            onDrop={handleDrop}
            onToggleCompletion={handleToggleCompletion}
          />
        </View>
        </ScrollView>
        </View>
      </DragDropProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  signOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  signOutText: {
    fontSize: 14,
    color: '#333',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  resetButtonText: {
    fontSize: 12,
    color: '#333',
  },
  addThemeContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  addThemeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeInput: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 10,
    fontSize: 14,
  },
  addThemeButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
  },
  addThemeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

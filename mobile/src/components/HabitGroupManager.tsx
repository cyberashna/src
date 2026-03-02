import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { database } from '../services/database';
import type { HabitGroup } from '../types';

interface HabitGroupManagerProps {
  visible: boolean;
  onClose: () => void;
  themeId: string;
  userId: string;
  groups: HabitGroup[];
  onGroupsChange: () => void;
}

export const HabitGroupManager: React.FC<HabitGroupManagerProps> = ({
  visible,
  onClose,
  themeId,
  userId,
  groups,
  onGroupsChange,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<HabitGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'strength_training' | 'custom'>('custom');
  const [linkBehavior, setLinkBehavior] = useState<'adjacent_merge' | 'none'>('none');
  const [saving, setSaving] = useState(false);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setSaving(true);
    try {
      if (editingGroup) {
        await database.habitGroups.update(editingGroup.id, {
          name: groupName,
          group_type: groupType,
          link_behavior: linkBehavior,
        });
      } else {
        await database.habitGroups.create(userId, themeId, groupName, groupType, linkBehavior);
      }

      setGroupName('');
      setGroupType('custom');
      setLinkBehavior('none');
      setEditingGroup(null);
      setShowForm(false);
      onGroupsChange();
    } catch (error) {
      Alert.alert('Error', 'Failed to save habit group');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditGroup = (group: HabitGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupType(group.group_type);
    setLinkBehavior(group.link_behavior);
    setShowForm(true);
  };

  const handleDeleteGroup = (group: HabitGroup) => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${group.name}"? Habits in this group will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.habitGroups.delete(group.id);
              onGroupsChange();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setGroupName('');
    setGroupType('custom');
    setLinkBehavior('none');
    setEditingGroup(null);
    setShowForm(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Habit Groups</Text>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {showForm ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {editingGroup ? 'Edit Group' : 'Create New Group'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Group Name (e.g., Strength Training)"
              value={groupName}
              onChangeText={setGroupName}
              autoFocus
            />

            <Text style={styles.label}>Group Type</Text>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => setGroupType('strength_training')}
              >
                <View style={styles.radio}>
                  {groupType === 'strength_training' && <View style={styles.radioSelected} />}
                </View>
                <Text style={styles.radioLabel}>Strength Training</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => setGroupType('custom')}
              >
                <View style={styles.radio}>
                  {groupType === 'custom' && <View style={styles.radioSelected} />}
                </View>
                <Text style={styles.radioLabel}>Custom</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Link Behavior</Text>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => setLinkBehavior('adjacent_merge')}
              >
                <View style={styles.radio}>
                  {linkBehavior === 'adjacent_merge' && <View style={styles.radioSelected} />}
                </View>
                <Text style={styles.radioLabel}>Merge Adjacent Blocks</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => setLinkBehavior('none')}
              >
                <View style={styles.radio}>
                  {linkBehavior === 'none' && <View style={styles.radioSelected} />}
                </View>
                <Text style={styles.radioLabel}>No Linking</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={resetForm}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.saveButton, saving && styles.disabledButton]}
                onPress={handleCreateGroup}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : editingGroup ? 'Update' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {groups.length === 0 ? (
              <Text style={styles.emptyText}>
                No habit groups yet. Create one to organize your habits.
              </Text>
            ) : (
              groups.map((group) => (
                <View key={group.id} style={styles.groupCard}>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupMeta}>
                      {group.group_type === 'strength_training' ? 'Strength Training' : 'Custom'}
                      {' • '}
                      {group.link_behavior === 'adjacent_merge' ? 'Merges Adjacent' : 'No Linking'}
                    </Text>
                  </View>
                  <View style={styles.groupActions}>
                    <TouchableOpacity
                      onPress={() => handleEditGroup(group)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.editText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteGroup(group)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 16,
    color: '#6b7280',
  },
  addButton: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  form: {
    padding: 16,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  radioGroup: {
    marginBottom: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#3b82f6',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 16,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disabledButton: {
    opacity: 0.6,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 32,
  },
  groupCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  groupMeta: {
    fontSize: 14,
    color: '#6b7280',
  },
  groupActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});

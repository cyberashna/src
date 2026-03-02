import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { database } from '../services/database';
import type { SessionGroup } from '../types';
import { getSessionColor, hexToRgba } from '../utils/colors';

interface SessionGroupPickerProps {
  visible: boolean;
  onClose: () => void;
  weekStartDate: string;
  userId: string;
  sessionGroups: SessionGroup[];
  onSessionGroupsChange: () => void;
  onSelectSession: (sessionGroup: SessionGroup) => void;
}

export const SessionGroupPicker: React.FC<SessionGroupPickerProps> = ({
  visible,
  onClose,
  weekStartDate,
  userId,
  sessionGroups,
  onSessionGroupsChange,
  onSelectSession,
}) => {
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState('');

  const handleCreateSession = async () => {
    try {
      const nextNumber = await database.sessionGroups.getNextSessionNumber(userId, weekStartDate);
      const color = getSessionColor(nextNumber - 1);

      const newSession = await database.sessionGroups.create(
        userId,
        weekStartDate,
        nextNumber,
        color,
        customName.trim() || undefined
      );

      setCustomName('');
      setCreating(false);
      onSessionGroupsChange();
      onSelectSession(newSession);
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to create session group');
      console.error(error);
    }
  };

  const handleDeleteSession = (session: SessionGroup) => {
    Alert.alert(
      'Delete Session',
      'Are you sure? Blocks assigned to this session will lose their color.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.sessionGroups.delete(session.id);
              onSessionGroupsChange();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete session');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const handleRenameSession = (session: SessionGroup) => {
    Alert.prompt(
      'Rename Session',
      'Enter a custom name for this session',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (newName) => {
            if (newName !== undefined) {
              try {
                await database.sessionGroups.update(session.id, {
                  custom_name: newName.trim() || null,
                });
                onSessionGroupsChange();
              } catch (error) {
                Alert.alert('Error', 'Failed to rename session');
                console.error(error);
              }
            }
          },
        },
      ],
      'plain-text',
      session.custom_name || `Session ${session.session_number}`
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Session Groups</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {sessionGroups.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={[
                  styles.sessionCard,
                  { backgroundColor: hexToRgba(session.accent_color, 0.1) },
                ]}
                onPress={() => {
                  onSelectSession(session);
                  onClose();
                }}
              >
                <View style={styles.sessionInfo}>
                  <View
                    style={[styles.colorDot, { backgroundColor: session.accent_color }]}
                  />
                  <Text style={styles.sessionName}>
                    {session.custom_name || `Session ${session.session_number}`}
                  </Text>
                </View>
                <View style={styles.sessionActions}>
                  <TouchableOpacity
                    onPress={() => handleRenameSession(session)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionText}>Rename</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteSession(session)}
                    style={styles.actionButton}
                  >
                    <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}

            {creating ? (
              <View style={styles.createForm}>
                <TextInput
                  style={styles.input}
                  placeholder="Session name (optional)"
                  value={customName}
                  onChangeText={setCustomName}
                  autoFocus
                />
                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => {
                      setCustomName('');
                      setCreating(false);
                    }}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.createButton]}
                    onPress={handleCreateSession}
                  >
                    <Text style={[styles.buttonText, styles.createButtonText]}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setCreating(true)}
              >
                <Text style={styles.addButtonText}>+ New Session</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
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
    color: '#3b82f6',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  sessionCard: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  deleteText: {
    color: '#ef4444',
  },
  createForm: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  createButton: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  createButtonText: {
    color: '#fff',
  },
  addButton: {
    padding: 16,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 8,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
  },
});

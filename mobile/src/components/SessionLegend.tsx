import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { SessionGroup } from '../types';
import { hexToRgba } from '../utils/colors';

interface SessionLegendProps {
  sessionGroups: SessionGroup[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onManageSessions: () => void;
}

export const SessionLegend: React.FC<SessionLegendProps> = ({
  sessionGroups,
  selectedSessionId,
  onSelectSession,
  onManageSessions,
}) => {
  if (sessionGroups.length === 0) {
    return (
      <TouchableOpacity style={styles.emptyContainer} onPress={onManageSessions}>
        <Text style={styles.emptyText}>+ Add Session Groups</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        <TouchableOpacity
          style={[styles.chip, selectedSessionId === null && styles.chipSelected]}
          onPress={() => onSelectSession(null)}
        >
          <Text style={[styles.chipText, selectedSessionId === null && styles.chipTextSelected]}>
            No Session
          </Text>
        </TouchableOpacity>

        {sessionGroups.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={[
              styles.chip,
              selectedSessionId === session.id && styles.chipSelected,
              {
                backgroundColor:
                  selectedSessionId === session.id
                    ? session.accent_color
                    : hexToRgba(session.accent_color, 0.2),
              },
            ]}
            onPress={() => onSelectSession(session.id)}
          >
            <View style={[styles.colorDot, { backgroundColor: session.accent_color }]} />
            <Text
              style={[
                styles.chipText,
                selectedSessionId === session.id && styles.chipTextSelected,
              ]}
            >
              {session.custom_name || `Session ${session.session_number}`}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.manageButton} onPress={onManageSessions}>
          <Text style={styles.manageText}>Manage</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  scrollView: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#f3f4f6',
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: '#374151',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  manageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 16,
  },
  manageText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
});

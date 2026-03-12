import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Block {
  id: string;
  label: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  is_system_default: boolean;
  blocks: TemplateBlock[];
}

interface TemplateBlock {
  label: string;
  day_index: number;
  time_index: number;
}

interface QuickStartTemplateModalProps {
  userId: string;
  unscheduledBlocks: Block[];
  onClose: () => void;
  onApplyTemplate: (blocks: TemplateBlock[]) => void;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  morning: ['yoga', 'meditation', 'exercise', 'workout', 'coffee', 'breakfast', 'journal', 'shower', 'stretch'],
  evening: ['dinner', 'meal prep', 'wind down', 'reading', 'tv', 'relax', 'bedtime', 'night routine'],
  work: ['meeting', 'email', 'coding', 'writing', 'call', 'task', 'project', 'work'],
  'self-care': ['meditation', 'yoga', 'massage', 'bath', 'skincare', 'nap', 'rest'],
  fitness: ['gym', 'run', 'workout', 'exercise', 'cardio', 'strength', 'yoga', 'walk', 'bike']
};

export default function QuickStartTemplateModal({
  userId,
  unscheduledBlocks,
  onClose,
  onApplyTemplate
}: QuickStartTemplateModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('morning');
  const [suggestedActivities, setSuggestedActivities] = useState<Block[]>([]);
  const [customTemplate, setCustomTemplate] = useState<TemplateBlock[]>([]);

  useEffect(() => {
    loadTemplates();
    analyzeSuggestedActivities();
  }, [selectedCategory]);

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('quick_start_templates')
      .select('*, template_blocks(*)')
      .or(`user_id.eq.${userId},is_system_default.eq.true`)
      .eq('category', selectedCategory);

    if (error) {
      console.error('Error loading templates:', error);
      return;
    }

    const formattedTemplates = (data || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      is_system_default: t.is_system_default,
      blocks: (t.template_blocks || []).map((b: any) => ({
        label: b.label,
        day_index: b.day_index,
        time_index: b.time_index
      }))
    }));

    setTemplates(formattedTemplates);
  }

  function analyzeSuggestedActivities() {
    const keywords = CATEGORY_KEYWORDS[selectedCategory] || [];

    const suggested = unscheduledBlocks.filter(block => {
      const label = block.label.toLowerCase();
      return keywords.some(keyword => label.includes(keyword));
    });

    setSuggestedActivities(suggested);
  }

  function addToCustomTemplate(block: Block) {
    const defaultTimes: Record<string, number> = {
      morning: 7,
      evening: 18,
      work: 9,
      'self-care': 12,
      fitness: 6
    };

    const timeIndex = defaultTimes[selectedCategory] || 9;

    setCustomTemplate([...customTemplate, {
      label: block.label,
      day_index: 1,
      time_index: timeIndex + customTemplate.length,
    }]);
  }

  function removeFromCustomTemplate(index: number) {
    setCustomTemplate(customTemplate.filter((_, i) => i !== index));
  }

  function applyTemplate(template: Template) {
    const availableLabels = new Set(unscheduledBlocks.map(b => b.label));
    const validBlocks = template.blocks.filter(b => availableLabels.has(b.label));

    if (validBlocks.length === 0) {
      alert('None of the template activities are in your activity bank. Add them first!');
      return;
    }

    onApplyTemplate(validBlocks);
  }

  function applyCustomTemplate() {
    if (customTemplate.length === 0) {
      alert('Add some activities to your custom template first!');
      return;
    }

    onApplyTemplate(customTemplate);
  }

  const categories = [
    { id: 'morning', name: 'Morning Routine', icon: '🌅' },
    { id: 'evening', name: 'Evening Routine', icon: '🌙' },
    { id: 'work', name: 'Work Day', icon: '💼' },
    { id: 'self-care', name: 'Self-Care', icon: '✨' },
    { id: 'fitness', name: 'Fitness', icon: '💪' }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content quick-start-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Quick Start Templates</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="category-selector">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`category-button ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span className="category-icon">{cat.icon}</span>
              <span className="category-name">{cat.name}</span>
            </button>
          ))}
        </div>

        <div className="template-sections">
          <div className="suggested-activities">
            <h3>Suggested from Your Activities</h3>
            {suggestedActivities.length > 0 ? (
              <div className="activity-list">
                {suggestedActivities.map(block => (
                  <div key={block.id} className="activity-item">
                    <span>{block.label}</span>
                    <button
                      className="add-button"
                      onClick={() => addToCustomTemplate(block)}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-message">
                No {selectedCategory} activities found in your activity bank.
                Add activities like {CATEGORY_KEYWORDS[selectedCategory]?.slice(0, 3).join(', ')} to see suggestions!
              </p>
            )}
          </div>

          <div className="custom-template">
            <h3>Build Your Template</h3>
            {customTemplate.length > 0 ? (
              <>
                <div className="template-preview">
                  {customTemplate.map((block, index) => (
                    <div key={index} className="template-block">
                      <span className="block-number">{index + 1}</span>
                      <span className="block-label">{block.label}</span>
                      <button
                        className="remove-button"
                        onClick={() => removeFromCustomTemplate(index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button className="apply-button" onClick={applyCustomTemplate}>
                  Apply Custom Template
                </button>
              </>
            ) : (
              <p className="empty-message">
                Click + on suggested activities to build your template
              </p>
            )}
          </div>

          {templates.length > 0 && (
            <div className="saved-templates">
              <h3>Saved Templates</h3>
              <div className="template-list">
                {templates.map(template => (
                  <div key={template.id} className="template-card">
                    <div className="template-info">
                      <div className="template-name">{template.name}</div>
                      <div className="template-description">{template.description}</div>
                      <div className="template-blocks-count">
                        {template.blocks.length} activities
                      </div>
                    </div>
                    <button
                      className="apply-button small"
                      onClick={() => applyTemplate(template)}
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .quick-start-modal {
            background: white;
            border-radius: 12px;
            max-width: 900px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px;
            border-bottom: 1px solid #e9ecef;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 24px;
            color: #333;
          }

          .close-button {
            background: none;
            border: none;
            font-size: 32px;
            color: #999;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
          }

          .close-button:hover {
            background: #f8f9fa;
            color: #333;
          }

          .category-selector {
            display: flex;
            gap: 8px;
            padding: 20px 24px;
            border-bottom: 1px solid #e9ecef;
            overflow-x: auto;
          }

          .category-button {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: 2px solid #e9ecef;
            background: white;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
          }

          .category-button:hover {
            border-color: #667eea;
          }

          .category-button.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-color: #667eea;
            color: white;
          }

          .category-icon {
            font-size: 20px;
          }

          .category-name {
            font-weight: 600;
            font-size: 14px;
          }

          .template-sections {
            padding: 24px;
          }

          .template-sections h3 {
            margin: 0 0 16px 0;
            font-size: 18px;
            color: #333;
          }

          .suggested-activities,
          .custom-template,
          .saved-templates {
            margin-bottom: 32px;
          }

          .activity-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 8px;
          }

          .activity-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 6px;
            border: 1px solid #e9ecef;
          }

          .add-button {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: none;
            background: #667eea;
            color: white;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          }

          .add-button:hover {
            background: #5568d3;
          }

          .template-preview {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 16px;
          }

          .template-block {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 6px;
            border: 2px solid #667eea;
          }

          .block-number {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #667eea;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
          }

          .block-label {
            flex: 1;
            font-weight: 500;
          }

          .remove-button {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: none;
            background: #dc3545;
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          }

          .remove-button:hover {
            background: #c82333;
          }

          .apply-button {
            width: 100%;
            padding: 14px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
          }

          .apply-button:hover {
            transform: translateY(-2px);
          }

          .apply-button.small {
            padding: 8px 16px;
            font-size: 14px;
            width: auto;
          }

          .empty-message {
            color: #999;
            font-style: italic;
            padding: 20px;
            text-align: center;
            background: #f8f9fa;
            border-radius: 6px;
          }

          .template-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
          }

          .template-card {
            padding: 16px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
          }

          .template-info {
            flex: 1;
          }

          .template-name {
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 4px;
          }

          .template-description {
            font-size: 13px;
            color: #666;
            margin-bottom: 8px;
          }

          .template-blocks-count {
            font-size: 12px;
            color: #999;
          }
        `}</style>
      </div>
    </div>
  );
}

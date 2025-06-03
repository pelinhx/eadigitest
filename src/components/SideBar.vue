<script setup>
import { ref, computed } from 'vue';

// Reactive state to track the selected feature (using radio buttons)
const selectedFeature = ref('chromatic'); // Set default to 'chromatic'
const selectedLevel = ref('note'); // Set default to 'note'

// Function to handle radio button selection
function setFeature(feature) {
  selectedFeature.value = feature;
}

// Function to handle level selection
function setLevel(level) {
  selectedLevel.value = level;
}

// Feature name mapping for display purposes - REMOVED diatonic and diatonic_rhythmic
const featureDisplayNames = {
  chromatic: 'Chromatic',
  rhythmic: 'Rhythmic',
  chromatic_rhythmic: 'Chromatic & Rhythmic'
};

// Feature description for tooltips - REMOVED diatonic and diatonic_rhythmic
const featureDescriptions = {
  chromatic: 'Analyzes the music using all 12 chromatic pitches without regard for key',
  rhythmic: 'Focuses solely on rhythmic patterns without considering pitch',
  chromatic_rhythmic: 'Combined analysis of chromatic pitch and rhythmic patterns'
};

// Level name mapping for display purposes - RENAMED 'Global' to 'Note'
const levelDisplayNames = {
  note: 'Note',
  shared_segments: 'Shared Phrases (S)',
  structure: 'Form (F)'
};

// Combined levels - SIMPLIFIED to only one "Combined" option
const combinedLevelOptions = {
  combined_s75_ss25: 'Combined' // Simplified name for the single combined option
};

// Level description for tooltips
const levelDescriptions = {
  note: 'Analysis at individual note level, considering each note separately',
  shared_segments: 'Identifies and analyzes common melodic phrases shared between pieces',
  structure: 'Analyzes the high-level formal organization of the music',
  combined_s75_ss25: 'Combined analysis with 75% Form and 25% Shared Phrases'
};

// Computed property for the filename pattern based on selected feature
const featureFilenamePattern = computed(() => {
  return selectedFeature.value;
});

// Computed property for the analysis level pattern
const levelFilenamePattern = computed(() => {
  if (selectedLevel.value.startsWith('combined_')) {
    return selectedLevel.value.replace('combined_', 'combined_');
  }
  return selectedLevel.value;
});

// Expose selected items and computed properties for the parent component
defineExpose({
  selectedFeature,
  selectedLevel,
  featureFilenamePattern,
  levelFilenamePattern
});
</script>

<template>
  <aside class="sidebar">
    <div class="filters-section">
      <h3>Features</h3>
      
      <div class="feature-options">
        <div 
          v-for="(displayName, feature) in featureDisplayNames" 
          :key="feature" 
          class="feature-option"
          :class="{
            'selected': selectedFeature === feature,
            'unselected': selectedFeature !== feature
          }"
          :title="featureDescriptions[feature]">
          <label>
            <span class="feature-label">{{ displayName }}</span>
            <input 
              type="radio" 
              name="feature" 
              :value="feature"
              :checked="selectedFeature === feature" 
              @change="setFeature(feature)" 
              class="square-radio" />
          </label>
        </div>
      </div>
    
    </div>

    <div class="filters-section">
      <h3>Level</h3>
      
      <div class="feature-options">
        <!-- Regular level options -->
        <div 
          v-for="(displayName, level) in levelDisplayNames" 
          :key="level" 
          class="feature-option"
          :class="{
            'selected': selectedLevel === level,
            'unselected': selectedLevel !== level
          }"
          :title="levelDescriptions[level]">
          <label>
            <span class="feature-label">{{ displayName }}</span>
            <input 
              type="radio" 
              name="level" 
              :value="level"
              :checked="selectedLevel === level" 
              @change="setLevel(level)" 
              class="square-radio" />
          </label>
        </div>
        
        <!-- Combined options at the same level as other options -->
        <div 
          v-for="(displayName, level) in combinedLevelOptions" 
          :key="level" 
          class="feature-option"
          :class="{
            'selected': selectedLevel === level,
            'unselected': selectedLevel !== level
          }"
          :title="levelDescriptions[level]">
          <label>
            <span class="feature-label">{{ displayName }}</span>
            <input 
              type="radio" 
              name="level" 
              :value="level"
              :checked="selectedLevel === level" 
              @change="setLevel(level)" 
              class="square-radio" />
          </label>
        </div>
      </div>
    </div>
  </aside>
</template>
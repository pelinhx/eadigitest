<script setup>
import { ref, computed } from 'vue'

// Reactive state to track the selected feature
const selectedFeature = ref(null)

// Function to handle checkbox selection
function toggleFeature(feature) {
  selectedFeature.value = selectedFeature.value === feature ? null : feature
}

// Reactive state for datasets with selection tracking
const datasets = ref([
  { name: 'Irish', color: '#3498EF', selected: true },
  { name: 'Galician', color: '#44E444', selected: true },
  // Add more datasets here if needed
])

// Toggle dataset selection
function toggleDataset(dataset) {
  dataset.selected = !dataset.selected
}

// Reactive state for genres with selection tracking
const genres = ref([
  { name: 'alalas', color: '#B0C7E8', selected: false },
  { name: 'barndance', color: '#1D77B3', selected: false },
  { name: 'foliadas', color: '#FFBB78', selected: false },
  { name: 'hornpipe', color: '#FF7F0F', selected: false },
  { name: 'jig', color: '#29A02B', selected: false },
  { name: 'jotas', color: '#98DF8B', selected: false },
  { name: 'march', color: '#D52827', selected: false },
  { name: 'marchas', color: '#FF9896', selected: false },
  { name: 'mazurcas', color: '#C6C7C6', selected: false },
  { name: 'mazurka', color: '#9368BD', selected: false },
  { name: 'muineiras', color: '#C5B0D5', selected: false },
  { name: 'pasacorredoi', color: '#C49C95', selected: false },
  { name: 'pasadobles', color: '#F6B6D2', selected: false },
  { name: 'polca', color: '#FF6347', selected: false },
  { name: 'polka', color: '#8B564B', selected: false },
  { name: 'reel', color: '#E378C1', selected: false },
  { name: 'rumbas', color: '#DBDB8D', selected: false },
  { name: 'slide', color: '#BCBD21', selected: false },
  { name: 'strathspey', color: '#14BFCE', selected: false },
  { name: 'valses', color: '#9FDAE5', selected: false },
  { name: 'waltz', color: '#D9D9D9', selected: false },
  // Add more genres here if needed
])

// Toggle genre selection
function toggleGenre(genre) {
  genre.selected = !genre.selected
}

// Expose selected items for the parent component
defineExpose({
  selectedFeature,
  datasets,
  genres
})
</script>

<template>
  <aside class="sidebar">
    <div class="filters-section">
      <h3>Features</h3>

      <div class="filter-item">
        <h5>Chromatic</h5>
        <input
          type="checkbox"
          class="toggle"
          :checked="selectedFeature === 'Chromatic'"
          @change="toggleFeature('Chromatic')"/>
      </div>
      
      <div class="filter-item">
        <h5>Rhythmic</h5>
        <input
          type="checkbox"
          class="toggle"
          :checked="selectedFeature === 'Rhythmic'"
          @change="toggleFeature('Rhythmic')"/>
      </div>
      
      <div class="filter-item">
        <h5>Both</h5>
        <input
          type="checkbox"
          class="toggle"
          :checked="selectedFeature === 'Both'"
          @change="toggleFeature('Both')"/>
      </div>
    </div>

    <div class="options-section">
      <h3>Traditions</h3>

      <div
        class="dataset-item"
        v-for="dataset in datasets"
        :key="dataset.name"
        @click="toggleDataset(dataset)">
        <h5>{{ dataset.name }}</h5>
        <span
          class="color-box"
          :style="{ 
            backgroundColor: dataset.color,
            opacity: dataset.selected ? 1 : 0.4
          }">
        </span>
      </div>
    </div>

    <div class="options-section">
      <h3>Genres</h3>
      
      <div
        class="dataset-item"
        v-for="genre in genres"
        :key="genre.name"
        @click="toggleGenre(genre)">
        <h5>{{ genre.name }}</h5>
        <span
          class="color-box"
          :style="{ 
            backgroundColor: genre.color,
            opacity: genre.selected ? 1 : 0.4
          }">
        </span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 250px; /* Or your preferred width */
  height: 100%;
  overflow-y: auto;
  background-color: #f5f5f5;
  padding: 1rem;
  border-right: 1px solid #ddd;
}
</style>
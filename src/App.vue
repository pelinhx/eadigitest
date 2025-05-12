<script setup>
import { ref, onMounted } from 'vue';
import NavBar from './components/NavBar.vue';
import SideBar from './components/SideBar.vue';
import VisualizationArea from './components/VisualizationArea.vue';

const sidebarRef = ref(null);

// Add console log to verify ref
onMounted(() => {
  console.log('App mounted, sidebar ref:', sidebarRef.value);
});
</script>

<template>
  <div class="app-container">
    <NavBar />
    <div class="content-container">
      <SideBar ref="sidebarRef" />
      <VisualizationArea :sidebarRef="sidebarRef" />
    </div>
  </div>
</template>

<style>
html, body {
  height: 100%;
  margin: 0;
  padding: 0;
}

.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.content-container {
  display: flex;
  flex: 1;
  height: calc(100vh - 60px); /* Adjust based on your NavBar height */
  overflow: hidden;
}
</style>
<script setup>
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import * as d3 from 'd3';
import '../assets/visualization.css';
import { processTreeData, getTraditionForGenre } from '../utils/treeUtils.js'; // Removed createLinkPath import

// STATE MANAGEMENT
const props = defineProps({ sidebarRef: { type: Object, required: true } });
const treeContainer = ref(null);
const treeData = ref(null);
const currentTreeData = ref(null);
const isLoading = ref(true);
const error = ref(null);
const selectedNode = ref(null);
const dataLoaded = ref(false);
const zoomBehavior = ref(null);
const currentZoom = ref(1);
const navigationHistory = ref([]);
const isZoomedToNode = ref(false);
const currentView = ref('traditions');
const currentTradition = ref(null);
const currentGenre = ref(null);
const availableGenres = ref([]);
const availableTrees = ref([]);

// DATA DEFINITIONS
const traditions = {
  irish: {
    name: "Irish Tradition",
    color: "#44E444",
    genres: ['barndance', 'hornpipe', 'jig', 'march', 'mazurka', 'polka', 'reel', 'slide', 'strathspey', 'waltz']
  },
  galician: {
    name: "Galician Tradition",
    color: "#3498EF",
    genres: ['alalas', 'foliadas', 'jotas', 'marchas', 'mazurcas', 'muineiras', 'pasacorredoi', 'pasodobles', 'polca', 'rumba', 'valse']
  },
  portuguese: {
    name: "Portuguese Tradition",
    color: "#E74C3C",
    genres: ['fado']
  }
};

// Meta-tree structure for top-level navigation
const traditionsTree = {
  name: "Folk Music Traditions",
  children: [
    {
      name: "",
      children: [
        { name: "Irish Tradition", tradition: "irish", color: traditions.irish.color },
        { name: "Galician Tradition", tradition: "galician", color: traditions.galician.color }
      ]
    },
    { name: "Portuguese Tradition", tradition: "portuguese", color: traditions.portuguese.color }
  ]
};

// COMPUTED PROPERTIES
const selectedFeature = computed(() => props.sidebarRef?.selectedFeature);
const datasets = computed(() => props.sidebarRef?.datasets || []);
const genres = computed(() => props.sidebarRef?.genres || []);
const featureType = computed(() => props.sidebarRef?.featureFilenamePattern || 'chromatic');
const levelType = computed(() => props.sidebarRef?.levelFilenamePattern || 'note');

const featureTypeDisplay = computed(() => {
  const featureMap = {
    'chromatic': 'Chromatic Analysis',
    'diatonic': 'Diatonic Analysis',
    'rhythmic': 'Rhythmic Analysis',
    'chromatic_rhythmic': 'Chromatic & Rhythmic Analysis',
    'diatonic_rhythmic': 'Diatonic & Rhythmic Analysis'
  };
  return featureMap[featureType.value] || 'Analysis';
});

const breadcrumbs = computed(() => {
  const crumbs = [{ text: 'Traditions', view: 'traditions' }];
  if (currentTradition.value) {
    crumbs.push({ 
      text: traditions[currentTradition.value]?.name || currentTradition.value, 
      view: 'tradition', 
      tradition: currentTradition.value 
    });
  }
  if (currentGenre.value) {
    crumbs.push({ 
      text: currentGenre.value.charAt(0).toUpperCase() + currentGenre.value.slice(1), 
      view: 'genre', 
      tradition: currentTradition.value, 
      genre: currentGenre.value
    });
  }
  return crumbs;
});

// UTILITY FUNCTIONS
function getDisplayName(name, genre = false) {
  if (!name) return '';
  if (genre) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  // For file-based names
  if (name.includes('.krn')) {
    const parts = name.split('_');
    if (parts.length >= 3) {
      const displayParts = parts.slice(2);
      const displayName = displayParts
        .join(' ')
        .replace(/\.krn$/, '')
        .replace(/_/g, ' ')
        .replace(/__/g, ' - ');
      return displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
    return name.replace(/\.krn$/, '');
  }
  
  // Default case
  return name;
}

// File mapping function for specific combinations
// filepath: /Users/pelinho/Desktop/Projeto Tese/Website Project/ea-digifolk-vis/src/components/VisualizationArea.vue
async function findAvailableTrees() {
  try {
    isLoading.value = true;
    
    // Get the current feature and level types from sidebar
    const feature = featureType.value;
    const level = levelType.value;
    let relevantFiles = [];
    
    // Special case mappings for specific combinations
const specialCaseMappings = {
  // Level "25% F + 75% S" (combined_s25_ss75) with "chromatic" feature
  'combined_s25_ss75_chromatic': 'genre_tree_combined_s25_ss75_chromatic_rhythmic.json',
  
  // Add the mapping you requested
  'combined_s25_ss75_chromatic_rhythmic': 'genre_tree_combined_s25_ss75_chromatic_rhythmic.json',
  
  // You can add more mappings here for other specific combinations
  // Format: 'level_feature': 'specific_filename.json',
};
    
    // Check for special case mapping first
    const specialCaseKey = `${level}_${feature}`;
    const specialCaseFile = specialCaseMappings[specialCaseKey];
    
    if (currentView.value === 'traditions' && specialCaseFile) {
      console.log(`Using special case mapping for ${specialCaseKey}: ${specialCaseFile}`);
      relevantFiles = [specialCaseFile];
    }
    // If not a special case or not in traditions view, use standard logic
    else if (currentView.value === 'traditions') {
      // For traditions overview, standard pattern
      relevantFiles = [`genre_tree_${level}_${feature}.json`];
    }
    else if (currentView.value === 'tradition') {
      // For specific tradition view
      const traditionPrefix = currentTradition.value?.toLowerCase() || '';
      
      relevantFiles = [
        `${level}_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `${level}_${feature}_all_genres_phylogenetic_tree.json`
      ];
    }
    else if (currentView.value === 'genre') {
      // For specific genre visualization
      const genrePrefix = currentGenre.value?.toLowerCase() || '';
      const traditionPrefix = currentTradition.value?.toLowerCase() || '';
      
      relevantFiles = [
        `score_tree_${feature}_${genrePrefix}.json`,
        `${level}_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        `${level}_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `${level}_${feature}_all_genres_phylogenetic_tree.json`
      ];
    }
    
    console.log(`Looking for tree files: feature=${feature}, level=${level}, view=${currentView.value}`);
    console.log(`File candidates: ${relevantFiles.join(', ')}`);
    availableTrees.value = relevantFiles;
    
    // Try to load files in priority order
    for (const file of relevantFiles) {
      try {
        // Check if file exists
        const checkResponse = await fetch(`/preprocessed_data/${file}`, { method: 'HEAD' });
        if (checkResponse.ok) {
          console.log(`Found file: ${file}`);
          return file;
        }
      } catch (err) {
        console.log(`File not found: ${file}`);
        // Continue to the next file
      }
    }
    
    // Default fallback when no files are found
    console.log('No suitable files found, returning first in list as fallback');
    return relevantFiles.length > 0 ? relevantFiles[0] : null;
    
  } catch (err) {
    console.error("Error finding available trees:", err);
    error.value = `Error finding tree files: ${err.message}`;
    return null;
  } finally {
    isLoading.value = false;
  }
}

async function loadTreeData() {
  isLoading.value = true;
  error.value = null;
  
  try {
    // For the top-level traditions view, always use the hardcoded tree
    if (currentView.value === 'traditions') {
      console.log('Using hardcoded traditions tree for top-level view');
      currentTreeData.value = traditionsTree;
      renderTree(traditionsTree, treeContainer.value);
      dataLoaded.value = true;
      return;
    }
    
    // For tradition or genre view, try to find a suitable tree file
    const treeFile = await findAvailableTrees();
    
    if (!treeFile) {
      // If no file found and we're in tradition view, create custom tree
      if (currentView.value === 'tradition') {
        createCustomGenreTree(currentTradition.value);
        return;
      }
      // For any other view, throw error
      else {
        throw new Error(`No suitable tree file found for ${currentView.value} view`);
      }
    }
    
    // If we found a file, try to load it
    console.log(`Loading tree from file: ${treeFile}`);
    try {
      const response = await fetch(`/preprocessed_data/${treeFile}`);
      if (!response.ok) {
        throw new Error(`Failed to load tree data: ${response.status}`);
      }
      
      const data = await response.json();
      currentTreeData.value = data;
      
      // Apply tradition-specific processing if needed
      const processedData = currentView.value === 'tradition' 
        ? enhanceAndFilterTreeForTradition(data, currentTradition.value) 
        : enhanceTree(data);
        
      treeData.value = processedData;
      renderTree(processedData, treeContainer.value);
      dataLoaded.value = true;
    } catch (fetchErr) {
      console.error(`Error fetching ${treeFile}:`, fetchErr);
      
      // Fall back to custom tree for tradition view
      if (currentView.value === 'tradition') {
        createCustomGenreTree(currentTradition.value);
      } else {
        throw fetchErr; // Re-throw for genre view
      }
    }
  } catch (err) {
    console.error('Error loading tree data:', err);
    error.value = `Error loading tree data: ${err.message}`;
    dataLoaded.value = false;
  } finally {
    isLoading.value = false;
  }
}

// TREE DATA PROCESSING FUNCTIONS
function enhanceTree(data) {
  if (!data) return data;
  
  // Deep copy to avoid mutating the original
  const treeCopy = JSON.parse(JSON.stringify(data));
  
  // Traverse the tree and enhance nodes with metadata
  const traverse = (node, parentInfo = {}) => {
    if (!node) return;
    
    // Apply parent genre/tradition if not present
    if (parentInfo.genre && !node.genre) node.genre = parentInfo.genre;
    if (parentInfo.tradition && !node.tradition) node.tradition = parentInfo.tradition;
    
    // Try to derive tradition from genre
    if (node.genre && !node.tradition) {
      const genreTradition = getTraditionForGenre(node.genre, traditions);
      if (genreTradition) node.tradition = genreTradition.name;
    }
    
    // Process file name patterns
    if (node.name && node.name.includes('_') && !node.genre) {
      const parts = node.name.split('_');
      if (parts.length > 1) {
        const possibleGenre = parts[1].toLowerCase();
        // Check if this matches a known genre in any tradition
        for (const [tradition, data] of Object.entries(traditions)) {
          if (data.genres.includes(possibleGenre)) {
            node.genre = possibleGenre;
            node.tradition = tradition;
            break;
          }
        }
      }
    }
    
    // Special case for Galician "pezas_" patterns
    if (node.name && node.name.includes('pezas_') && !node.genre) {
      const parts = node.name.split('_');
      if (parts.length > 2) {
        node.tradition = "galician";
        node.genre = parts[2].toLowerCase();
      }
    }
    
    // Create display names if not present
    if (node.name && !node.display_name) {
      node.display_name = getDisplayName(node.name, !!node.genre);
    }
    
    // Set color based on tradition
    if (node.tradition && !node.color) {
      node.color = traditions[node.tradition]?.color || '#999';
    }
    
    // Process children recursively
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => traverse(child, {
        genre: node.genre,
        tradition: node.tradition
      }));
    }
  };
  
  traverse(treeCopy);
  
  // Set root name if missing
  if (!treeCopy.name) {
    if (currentView.value === 'traditions') {
      treeCopy.name = "Folk Music Traditions";
    } else if (currentView.value === 'tradition' && currentTradition.value) {
      treeCopy.name = `${traditions[currentTradition.value]?.name || currentTradition.value} Genres`;
    } else if (currentView.value === 'genre' && currentGenre.value) {
      treeCopy.name = `${getDisplayName(currentGenre.value, true)} Scores`;
    } else {
      treeCopy.name = "Music Phylogenetic Tree";
    }
  }
  
  return treeCopy;
}

function enhanceAndFilterTreeForTradition(data, tradition) {
  if (!data || !tradition) return data;
  
  // First enhance the tree
  const enhancedTree = enhanceTree(data);
  
  // Then filter to only include nodes from the specified tradition
  const filterByTradition = (node) => {
    if (!node) return null;
    
    // Keep this node if it belongs to the target tradition
    if (node.tradition === tradition) {
      return node;
    }
    
    // If node has no children, don't keep it
    if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
      return null;
    }
    
    // Filter children recursively
    const filteredChildren = node.children
      .map(filterByTradition)
      .filter(Boolean);
    
    // If no children left after filtering, don't keep this node
    if (filteredChildren.length === 0) {
      return null;
    }
    
    // Create a modified node with only the filtered children
    return { ...node, children: filteredChildren };
  };
  
  return filterByTradition(enhancedTree) || enhancedTree;
}

// CUSTOM TREE CREATION
function createCustomGenreTree(tradition) {
  console.log("Creating custom genre tree for", tradition);
  const traditionGenres = traditions[tradition]?.genres || [];
  const traditionColor = traditions[tradition]?.color || "#999";
  
  // Create root node
  const genreTree = {
    name: `${traditions[tradition]?.name || tradition} Genres`,
    tradition,
    color: traditionColor,
    children: []
  };
  
  // Create a central node to connect all genres
  const centralNode = {
    name: "Genres",
    tradition,
    color: traditionColor,
    children: traditionGenres.map(genre => ({
      name: getDisplayName(genre, true),
      genre: genre.toLowerCase(),
      tradition,
      color: traditionColor,
      display_name: getDisplayName(genre, true)
    }))
  };
  
  // Add the central node to the root
  genreTree.children.push(centralNode);
  
  treeData.value = genreTree;
  dataLoaded.value = true;
  isLoading.value = false;
  nextTick(() => renderTree(genreTree, treeContainer.value));
}

// NAVIGATION FUNCTIONS
function navigateToTradition(tradition) {
  selectedNode.value = null;
  currentTradition.value = tradition;
  currentGenre.value = null;
  currentView.value = 'tradition';
  navigationHistory.value = [];
  isZoomedToNode.value = false;
  availableGenres.value = traditions[tradition]?.genres || [];
  
  isLoading.value = true;
  loadTreeData();
}

function navigateToGenre(genre) {
  selectedNode.value = null;
  currentGenre.value = genre;
  currentView.value = 'genre';
  navigationHistory.value = [];
  isZoomedToNode.value = false;
  
  loadTreeData();
}

function navigateToBreadcrumb(crumb) {
  selectedNode.value = null;
  currentView.value = crumb.view;
  
  if (crumb.view === 'traditions') {
    currentTradition.value = null;
    currentGenre.value = null;
  } else if (crumb.view === 'tradition') {
    currentTradition.value = crumb.tradition;
    currentGenre.value = null;
  }
  
  loadTreeData();
}

function goBack() {
  if (navigationHistory.value.length > 0) {
    const previousView = navigationHistory.value.pop();
    
    d3.select(treeContainer.value)
      .select('svg')
      .transition()
      .duration(750)
      .call(zoomBehavior.value.transform, previousView.transform);
      
    currentZoom.value = previousView.zoom;
    selectedNode.value = null;
    isZoomedToNode.value = navigationHistory.value.length > 0;
    
    d3.select(treeContainer.value)
      .selectAll('.node circle')
      .attr('r', d => d.children ? 7 : 5)
      .attr('stroke-width', 1)
      .classed('selected', false);
  }
}

// INTERACTION HANDLERS
function handleNodeClick(event, d) {
  event.stopPropagation();
  selectedNode.value = d;
  
  // Update visual selection state
  d3.select(treeContainer.value).selectAll('.node circle')
    .attr('r', d => d.children ? 7 : 5)
    .attr('stroke-width', 1)
    .classed('selected', false);
    
  d3.select(event.currentTarget).select('circle')
    .attr('r', d => d.children ? 10 : 8)
    .attr('stroke-width', 2)
    .classed('selected', true);
  
  // Update navigation history
  if (!isZoomedToNode.value) {
    navigationHistory.value.push({
      transform: d3.zoomTransform(d3.select(treeContainer.value).select('svg').node()),
      zoom: currentZoom.value
    });
    isZoomedToNode.value = true;
  }
  
  // Zoom to node
  const containerWidth = treeContainer.value.clientWidth;
  const containerHeight = treeContainer.value.clientHeight;
  const nodeZoom = Math.min(currentZoom.value * 1.2, 2);
  
  d3.select(treeContainer.value)
    .select('svg')
    .transition()
    .duration(750)
    .call(
      zoomBehavior.value.transform,
      d3.zoomIdentity.translate(-d.y + containerWidth/3, -d.x + containerHeight/2).scale(nodeZoom)
    );
    
  currentZoom.value = nodeZoom;
  
  // Special case for the parent node that contains Irish and Galician traditions
  if (currentView.value === 'traditions' && !d.data.tradition && d.children) {
    // Check if this is the parent node by examining its children
    const hasIrishGalicianChildren = d.children.some(child => 
      child.data.tradition === 'irish' || child.data.tradition === 'galician');
    
    if (hasIrishGalicianChildren) {
      console.log('Loading special JSON tree for Irish-Galician combined node');
      
      // Load the special combined tree based on current feature/level
      loadSpecialTree();
      return;
    }
  }
  
  // Handle regular navigation based on node type
  if (currentView.value === 'traditions' && d.data.tradition) {
    setTimeout(() => navigateToTradition(d.data.tradition), 1000);
  } 
  else if (currentView.value === 'tradition' && d.data.genre) {
    setTimeout(() => navigateToGenre(d.data.genre.toLowerCase()), 1000);
  }
}

// New function to load special tree for the combined node
// New function to load special tree for the combined node
async function loadSpecialTree() {
  isLoading.value = true;
  error.value = null;
  
  try {
    // Get the current feature and level types
    const feature = featureType.value;
    const level = levelType.value;
    
    // Generate the special case key
    const specialCaseKey = `${level}_${feature}`;
    
    // Special case mappings for specific combinations
    const specialCaseMappings = {
      // Level "25% F + 75% S" with chromatic feature
      'combined_s25_ss75_chromatic': 'genre_tree_combined_s25_ss75_chromatic_rhythmic.json',
      'combined_s25_ss75_chromatic_rhythmic': 'genre_tree_combined_s25_ss75_chromatic_rhythmic.json',
      
      // Add more mappings as needed for other feature/level combinations
      'combined_s50_ss50_chromatic': 'genre_tree_combined_s50_ss50_chromatic.json',
      'combined_s50_ss50_chromatic_rhythmic': 'genre_tree_combined_s50_ss50_chromatic_rhythmic.json',
      'combined_s75_ss25_chromatic': 'genre_tree_combined_s75_ss25_chromatic.json',
      'combined_s75_ss25_chromatic_rhythmic': 'genre_tree_combined_s75_ss25_chromatic_rhythmic.json',
      
      // Diatonic mappings
      'combined_s25_ss75_diatonic': 'genre_tree_combined_s25_ss75_diatonic.json',
      'combined_s25_ss75_diatonic_rhythmic': 'genre_tree_combined_s25_ss75_diatonic_rhythmic.json',
      'combined_s50_ss50_diatonic': 'genre_tree_combined_s50_ss50_diatonic.json',
      'combined_s50_ss50_diatonic_rhythmic': 'genre_tree_combined_s50_ss50_diatonic_rhythmic.json',
      'combined_s75_ss25_diatonic': 'genre_tree_combined_s75_ss25_diatonic.json',
      'combined_s75_ss25_diatonic_rhythmic': 'genre_tree_combined_s75_ss25_diatonic_rhythmic.json',
      
      // Note level mappings
      'note_chromatic': 'genre_tree_note_chromatic.json',
      'note_chromatic_rhythmic': 'genre_tree_note_chromatic_rhythmic.json',
      'note_diatonic': 'genre_tree_note_diatonic.json',
      'note_diatonic_rhythmic': 'genre_tree_note_diatonic_rhythmic.json',
      
      // Rhythmic only mappings
      'combined_s25_ss75_rhythmic': 'genre_tree_combined_s25_ss75_rhythmic.json',
      'combined_s50_ss50_rhythmic': 'genre_tree_combined_s50_ss50_rhythmic.json',
      'combined_s75_ss25_rhythmic': 'genre_tree_combined_s75_ss25_rhythmic.json',
      'note_rhythmic': 'genre_tree_note_rhythmic.json'
    };
    
    // Get the special file if available, or use a default pattern
    const treeFile = specialCaseMappings[specialCaseKey] || `genre_tree_${level}_${feature}.json`;
    
    console.log(`Loading special tree from file: ${treeFile}`);
    const response = await fetch(`/preprocessed_data/${treeFile}`);
    
    if (!response.ok) {
      throw new Error(`Failed to load tree data: ${response.status}`);
    }
    
    const data = await response.json();
    currentTreeData.value = data;
    const processedData = enhanceTree(data);
    treeData.value = processedData;
    
    // Set page title based on feature and level
    let pageTitle = "Folk Music Traditions Phylogenetic Tree";
    if (featureTypeDisplay.value) {
      pageTitle += ` - ${featureTypeDisplay.value}`;
    }
    if (level) {
      const levelDisplay = level.replace('combined_', '')
                              .replace('s25_ss75', '25% F + 75% S')
                              .replace('s50_ss50', '50% F + 50% S')
                              .replace('s75_ss25', '75% F + 25% S')
                              .replace('note', 'Note Level');
      pageTitle += ` (${levelDisplay})`;
    }
    
    // Update visualization
    renderTree(processedData, treeContainer.value);
    dataLoaded.value = true;
    
    console.log(`Successfully loaded special tree: ${treeFile}`);
  } catch (err) {
    console.error('Error loading special tree:', err);
    error.value = `Error loading special tree: ${err.message}`;
    // Fall back to hardcoded tree if there's an error
    renderTree(traditionsTree, treeContainer.value);
  } finally {
    isLoading.value = false;
  }
}

// VISUALIZATION RENDERING
function renderTree(data, container) {
  // Clear the container first
  d3.select(container).selectAll('svg').remove();
  
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  
  // Create SVG element
  const svg = d3.select(container)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .call(zoomBehavior.value);
    
  const g = svg.append('g');
  
  // Handle the root of the tree
  const root = d3.hierarchy(data);
  
  // Get layout configuration based on view type
  const layoutConfig = getLayoutConfigForView(currentView.value, containerWidth, containerHeight);
  const treeLayout = d3.tree().size(layoutConfig.size);
  const treeData = treeLayout(root);
  
  // Render links
  renderTreeLinks(g, treeData);
  
  // Render nodes
  renderTreeNodes(g, treeData);
  
  // Center the tree initially
  centerTree(svg, g, containerWidth, containerHeight);
}

// Helper functions for rendering
function getLayoutConfigForView(view, width, height) {
  switch(view) {
    case 'traditions':
      return { size: [height * 0.5, width * 0.4] };
    case 'tradition':
      return { size: [height * 0.8, width * 0.7] };
    default: // genre view or fallback
      return { size: [height * 0.9, width * 0.7] };
  }
}

function renderTreeLinks(g, treeData) {
  return g.selectAll('.link')
    .data(treeData.links())
    .enter()
    .append('path')
    .attr('class', d => {
      const targetTradition = getNodeTradition(d.target);
      return `link ${targetTradition}`;
    })
    .attr("d", createLinkPath) // Using the imported function
    .attr("fill", "none")
    .attr("stroke", d => getLinkColor(d))
    .attr("stroke-width", d => currentView.value === 'traditions' && d.target.data.tradition ? 2.5 : 2)
    .attr("stroke-opacity", 0.8);
}

function getNodeTradition(node) {
  // Helper to determine a node's tradition based on context
  if (node.data.tradition) return node.data.tradition;
  if (node.parent && node.parent.data.tradition) return node.parent.data.tradition;
  if (currentView.value === 'tradition' || currentView.value === 'genre') return currentTradition.value;
  return 'default';
}

function getLinkColor(d) {
  // Determine link color based on node traditions
  if (d.target.data.tradition) return traditions[d.target.data.tradition]?.color;
  if (d.target.parent && d.target.parent.data.tradition) return traditions[d.target.parent.data.tradition]?.color;
  if (currentView.value === 'tradition' || currentView.value === 'genre') return traditions[currentTradition.value]?.color;
  return "#555";
}

// Defining createLinkPath here since we're not importing it
function createLinkPath(d) {
  return "M" + d.source.y + "," + d.source.x
    + "C" + (d.source.y + d.target.y) / 2 + "," + d.source.x
    + " " + (d.source.y + d.target.y) / 2 + "," + d.target.x
    + " " + d.target.y + "," + d.target.x;
}

function renderTreeNodes(g, treeData) {
  const node = g.selectAll('.node')
    .data(treeData.descendants())
    .enter()
    .append('g')
    .attr('class', d => {
      const traditionClass = getNodeTradition(d);
      return `node ${d.children ? 'node--internal' : 'node--leaf'} ${traditionClass}`;
    })
    .attr('transform', d => `translate(${d.y}, ${d.x})`)
    .on('click', handleNodeClick);
  
  // Add circles for nodes
  node.append('circle')
    .attr('r', d => !d.children && (d.data.genre || d.data.name === 'genre') ? 6 : (d.children ? 7 : 5))
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', '#fff')
    .attr('stroke-width', d => !d.children && d.data.genre ? 2 : 1.5);
  
  // Add text labels for nodes
  node.append('text')
    .attr('dy', d => !d.children ? '0.31em' : (d.children ? '-12' : '15'))
    .attr('x', d => !d.children ? 15 : (d.children ? 0 : 10))
    .attr('text-anchor', d => d.children ? 'middle' : 'start')
    .attr('dominant-baseline', 'middle')
    .text(d => {
      if (d.data.display_name) return d.data.display_name;
      if (currentView.value === 'traditions' && d.data.name && d.data.name !== '') {
        return d.data.name.charAt(0).toUpperCase() + d.data.name.slice(1);
      }
      if (d.data.genre) return d.data.genre.charAt(0).toUpperCase() + d.data.genre.slice(1);
      return '';
    })
    .attr('font-size', d => {
      const isLeafWithContent = !d.children && 
        (d.data.genre || (currentView.value === 'traditions' && d.data.name && d.data.name !== ''));
      return isLeafWithContent ? '13px' : '12px';
    })
    .attr('fill', '#333');
  
  // Add tooltips
  node.append('title')
    .text(d => getNodeTooltip(d));
}

function getNodeColor(d) {
  if (d.data.tradition) return traditions[d.data.tradition]?.color || '#999';
  if (d.data.genre) {
    const genre = genres.value.find(g => g.name === d.data.genre);
    return genre ? genre.color : '#999';
  }
  if (d.data.name && d.data.name !== '' && currentView.value === 'traditions') {
    const genre = genres.value.find(g => g.name === d.data.name);
    return genre ? genre.color : '#999';
  }
  return '#999';
}

function getNodeTooltip(d) {
  if (currentView.value === 'traditions' && d.data.tradition) {
    return `${d.data.name}\nClick to explore ${d.data.name} genres`;
  }
  
  let info = d.data.name || d.data.genre || '';
  if (d.data.tradition) {
    info += `\nTradition: ${traditions[d.data.tradition]?.name || d.data.tradition}`;
  }
  return info;
}

// HELPER FUNCTIONS
function centerTree(svg, g, width, height) {
  const bounds = g.node().getBBox();
  const dx = bounds.width;
  const dy = bounds.height;
  const x = bounds.x;
  const y = bounds.y;
  
  const scale = 0.9 / Math.max(dx / width, dy / height);
  const translate = [width / 2 - scale * (x + dx / 2), height / 2 - scale * (y + dy / 2)];
  
  svg.transition().duration(750).call(
    zoomBehavior.value.transform,
    d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
  );
  
  currentZoom.value = scale;
}

function filterTree() {
  if (!treeContainer.value || !dataLoaded.value) return;
  
  const selectedGenres = genres.value.filter(g => g.selected).map(g => g.name.toLowerCase());
  
  if (selectedGenres.length === 0) {
    d3.select(treeContainer.value).selectAll('.node').style('opacity', 1);
    d3.select(treeContainer.value).selectAll('.link').style('opacity', 0.8);
    return;
  }
  
  d3.select(treeContainer.value).selectAll('.node')
    .style('opacity', d => !d.data.genre ? 0.3 : 
           selectedGenres.includes(d.data.genre.toLowerCase()) ? 1 : 0.2);
  
  d3.select(treeContainer.value).selectAll('.link')
    .style('opacity', d => !d.target.data.genre ? 0.3 : 
           selectedGenres.includes(d.target.data.genre.toLowerCase()) ? 0.8 : 0.1);
}

// WATCHERS AND LIFECYCLE
watch(() => genres.value, () => { if (dataLoaded.value) filterTree(); }, { deep: true });

watch(() => dataLoaded.value, () => {
  navigationHistory.value = [];
  isZoomedToNode.value = false;
}, { immediate: true });

// Watch for feature and level changes from sidebar
watch([featureType, levelType], () => {
  console.log(`Analysis params changed: feature=${featureType.value}, level=${levelType.value}`);
  loadTreeData();
});

onMounted(() => {
  // Initialize zoom behavior
  zoomBehavior.value = d3.zoom()
    .scaleExtent([0.1, 10])
    .on('zoom', (event) => {
      d3.select(treeContainer.value)
        .select('svg g')
        .attr('transform', event.transform);
      currentZoom.value = event.transform.k;
    });
    
  // Initialize data loading
  setTimeout(() => {
    if (treeContainer.value) {
      loadTreeData();
    } else {
      error.value = 'Container not available';
      isLoading.value = false;
    }
  }, 100);
});
</script>

<template>
  <main class="visualization-area">
    <!-- Breadcrumb navigation -->
    <div class="breadcrumb-navigation">
      <ul class="breadcrumbs">
        <li v-for="(crumb, index) in breadcrumbs" :key="index">
          <a href="#" @click.prevent="navigateToBreadcrumb(crumb)">{{ crumb.text }}</a>
          <span v-if="index < breadcrumbs.length - 1" class="separator">&gt;</span>
        </li>
      </ul>
    </div>
    
    <div class="visualization-container">
      <!-- Main tree container -->
      <div ref="treeContainer" class="tree-container"></div>
      
      <!-- Back button -->
      <div v-if="isZoomedToNode" class="back-button" @click="goBack" title="Go back">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
        </svg>
      </div>
      
      <!-- Loading overlay -->
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>Loading tree visualization...</p>
      </div>
      
      <!-- Error overlay -->
      <div v-if="error" class="error-overlay">
        <p>{{ error }}</p>
        <button @click="loadTreeData">Retry</button>
      </div>
      
      <!-- Node details panel -->
      <div v-if="selectedNode" class="node-details">
        <h4>Selected Node: {{ selectedNode.data.display_name || selectedNode.data.name }}</h4>
        
        <div v-if="currentView === 'traditions'">
          <p v-if="selectedNode.data.tradition">
            <strong>Tradition:</strong> {{ traditions[selectedNode.data.tradition]?.name }}
            <br>
            <button 
              @click="navigateToTradition(selectedNode.data.tradition)" 
              class="explore-button"
              v-if="selectedNode.data.tradition"
            >
              Explore {{ traditions[selectedNode.data.tradition]?.name }}
            </button>
          </p>
        </div>
        
        <div v-else-if="currentView === 'tradition'">
          <p>
            <strong>Tradition:</strong> {{ traditions[currentTradition.value]?.name }}
            <span v-if="selectedNode.data.genre">
              <br>
              <strong>Genre:</strong> {{ selectedNode.data.genre }}
              <br>
              <button 
                @click="navigateToGenre(selectedNode.data.genre.toLowerCase())" 
                class="explore-button"
              >
                Explore {{ selectedNode.data.genre }} scores
              </button>
            </span>
          </p>
        </div>
        
        <div v-else-if="currentView === 'genre'">
          <p>
            <strong>Genre:</strong> {{ currentGenre.value }}
            <br>
            <strong>Tradition:</strong> {{ traditions[currentTradition.value]?.name }}
            <br>
            <span v-if="selectedNode.data.attributes">
              <span v-for="(value, key) in selectedNode.data.attributes" :key="key">
                <strong>{{ key }}:</strong> {{ value }}<br>
              </span>
            </span>
          </p>
        </div>
      </div>
      
      <!-- View description -->
      <div class="view-description">
        <span v-if="currentView === 'traditions'">
          Exploring Folk Music Traditions ({{ featureTypeDisplay }}) - Click on a tradition to see its genres
        </span>
        <span v-else-if="currentView === 'tradition'">
          Exploring {{ traditions[currentTradition.value]?.name }} Genres ({{ featureTypeDisplay }}) - Click on a genre to explore its scores
        </span>
        <span v-else-if="currentView === 'genre'">
          Exploring {{ currentGenre.value.charAt(0).toUpperCase() + currentGenre.value.slice(1) }} scores in {{ traditions[currentTradition.value]?.name }} ({{ featureTypeDisplay }})
        </span>
      </div>
    </div>
  </main>
</template>
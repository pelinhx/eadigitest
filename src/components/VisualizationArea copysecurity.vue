<script setup>
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import * as d3 from 'd3';
import '../assets/visualization.css'; // Import the separate CSS file

// STATE MANAGEMENT
const props = defineProps({ sidebarRef: { type: Object, required: true } });
const treeContainer = ref(null);
const treeData = ref(null);
const currentTreeData = ref(null); // Add this line
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
const featureTypeDisplay = computed(() => {
  switch (featureType.value) {
    case 'chromatic': return 'Chromatic Analysis';
    case 'diatonic': return 'Diatonic Analysis';
    case 'rhythmic': return 'Rhythmic Analysis';
    case 'chromatic_rhythmic': return 'Chromatic & Rhythmic Analysis';
    case 'diatonic_rhythmic': return 'Diatonic & Rhythmic Analysis';
    default: return 'Analysis';
  }
});
const breadcrumbs = computed(() => {
  const crumbs = [{ text: 'Traditions', view: 'traditions' }];
  if (currentTradition.value) {
    crumbs.push({ 
      text: traditions[currentTradition.value].name, 
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
function getTraditionForGenre(genre) {
  if (!genre) return null;
  const genreLower = genre.toLowerCase();
  for (const [tradition, data] of Object.entries(traditions)) {
    if (data.genres.includes(genreLower)) return { name: tradition, ...data };
  }
  return null;
}

// DATA LOADING FUNCTIONS
// Update the findAvailableTrees function to match file naming patterns
async function findAvailableTrees() {
  try {
    isLoading.value = true;
    
    // Get the current feature type from sidebar
    const feature = featureType.value;
    let relevantFiles = [];
    
    if (currentView.value === 'traditions') {
      // For traditions overview, use genre_tree files
      relevantFiles = [
        // Main feature-based genre trees
        `genre_tree_note_${feature}.json`,
        `genre_tree_shared_segments_${feature}.json`, 
        `genre_tree_structure_${feature}.json`,
        
        // Combined weightings
        `genre_tree_combined_s25_ss75_${feature}.json`,
        `genre_tree_combined_s50_ss50_${feature}.json`,
        `genre_tree_combined_s75_ss25_${feature}.json`
      ];
    } 
    else if (currentView.value === 'tradition') {
      // For specific tradition view, looking at genres within a tradition
      const traditionPrefix = currentTradition.value?.toLowerCase() || '';
      
      relevantFiles = [
        // Note level analysis
        `note_level_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        
        // Shared segments level analysis
        `shared_segments_level_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        
        // Structure level analysis
        `structure_level_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        
        // Combined with various weightings
        `combined_s25_ss75_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `combined_s50_ss50_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `combined_s75_ss25_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        
        // Fallbacks to all genres files
        `note_level_${feature}_all_genres_phylogenetic_tree.json`,
        `shared_segments_level_${feature}_all_genres_phylogenetic_tree.json`,
        `structure_level_${feature}_all_genres_phylogenetic_tree.json`,
        `combined_s25_ss75_${feature}_all_genres_phylogenetic_tree.json`,
        `combined_s50_ss50_${feature}_all_genres_phylogenetic_tree.json`,
        `combined_s75_ss25_${feature}_all_genres_phylogenetic_tree.json`
      ];
    } 
    else if (currentView.value === 'genre') {
      // For specific genre visualization
      const genrePrefix = currentGenre.value?.toLowerCase() || '';
      const traditionPrefix = currentTradition.value?.toLowerCase() || '';
      
      relevantFiles = [
        // Score-specific files
        `score_tree_${feature}_${genrePrefix}.json`,
        
        // Specific genre analyses at different levels
        `note_level_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        `shared_segments_level_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        `structure_level_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        
        // Combined weights for specific genre
        `combined_s25_ss75_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        `combined_s50_ss50_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        `combined_s75_ss25_${feature}_${genrePrefix}_phylogenetic_tree.json`,
        
        // Fallback to tradition-specific files
        `note_level_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `shared_segments_level_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `structure_level_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `combined_s25_ss75_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `combined_s50_ss50_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        `combined_s75_ss25_${feature}_${traditionPrefix}_genres_phylogenetic_tree.json`,
        
        // Last resort fallbacks
        `note_level_${feature}_all_genres_phylogenetic_tree.json`,
        `shared_segments_level_${feature}_all_genres_phylogenetic_tree.json`
      ];
    }
    
    console.log('Looking for tree files with feature:', feature, 'View:', currentView.value);
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

// Update loadTreeData to better handle different file formats
async function loadTreeData() {
  isLoading.value = true;
  error.value = null;
  
  try {
    // For traditions view, we use our custom hardcoded tree
    if (currentView.value === 'traditions') {
      // Always use the hardcoded tree for the first view
      console.log('Using hardcoded traditions tree for first page');
      currentTreeData.value = traditionsTree;
      renderTree(traditionsTree, treeContainer.value);
      dataLoaded.value = true;
    }
    else {
      // For tradition or genre view, find and load the appropriate tree file
      const treeFile = await findAvailableTrees();
      
      if (treeFile) {
        console.log(`Loading tree from file: ${treeFile}`);
        try {
          const response = await fetch(`/preprocessed_data/${treeFile}`);
          
          if (!response.ok) {
            throw new Error(`Failed to load tree data: ${response.status}`);
          }
          
          const treeData = await response.json();
          currentTreeData.value = treeData;
          
          // Apply any necessary processing to the tree data
          const processedData = processTreeData(treeData);
          renderTree(processedData, treeContainer.value);
          dataLoaded.value = true;
        } catch (fetchErr) {
          console.error(`Error fetching ${treeFile}:`, fetchErr);
          
          if (currentView.value === 'tradition') {
            // Fall back to custom tree for tradition view
            createCustomGenreTree(currentTradition.value);
          } else {
            throw fetchErr; // Re-throw for genre view
          }
        }
      } else {
        if (currentView.value === 'tradition') {
          // If no tree file found for tradition view, create a custom one
          createCustomGenreTree(currentTradition.value);
        } else {
          throw new Error(`No suitable tree file found for ${currentView.value} view with ${featureType.value} feature`);
        }
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

function processTreeData(data) {
  if (!data) return data;
  
  // Create a modified copy if we need to filter by tradition
  let processedData = data;
  
  // For tradition view, filter to only show nodes from the current tradition
  if (currentView.value === 'tradition' && currentTradition.value) {
    // First do a full traversal to enhance all nodes with proper attributes
    const traverseAndEnhance = (node, parentInfo = {}) => {
      if (!node) return;
      
      // Apply parent genre/tradition if not present on node
      if (parentInfo.genre && !node.genre) node.genre = parentInfo.genre;
      if (parentInfo.tradition && !node.tradition) node.tradition = parentInfo.tradition;
      
      // Try to derive tradition from genre if possible
      if (node.genre && !node.tradition) {
        const genreTradition = getTraditionForGenre(node.genre);
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
      
      // For Galician "pezas_" patterns
      if (node.name && node.name.includes('pezas_') && !node.genre) {
        const parts = node.name.split('_');
        if (parts.length > 2) {
          const possibleGenre = parts[2].toLowerCase();
          node.tradition = "galician";
          node.genre = possibleGenre;
        }
      }
      
      // Create display names
      if (node.name && !node.display_name) {
        if (node.name.includes('.krn')) {
          const parts = node.name.split('_');
          if (parts.length >= 3) {
            const displayParts = parts.slice(2);
            const displayName = displayParts
              .join(' ')
              .replace(/\.krn$/, '')
              .replace(/_/g, ' ')
              .replace(/__/g, ' - ');
            node.display_name = displayName.charAt(0).toUpperCase() + displayName.slice(1);
          } else {
            node.display_name = node.name.replace(/\.krn$/, '');
          }
        } else {
          node.display_name = node.name;
        }
      }
      
      // Process children recursively
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => traverseAndEnhance(child, {
          genre: node.genre,
          tradition: node.tradition
        }));
      }
    };
    
    // First do a full traversal to enhance all nodes with proper attributes
    traverseAndEnhance(processedData);
    
    // Then filter the tree to only include nodes from the current tradition
    const filterTreeByTradition = (node) => {
      if (!node) return null;
      
      // If this node belongs to the current tradition, keep it
      if (node.tradition === currentTradition.value) {
        return node;
      }
      
      // If node has no children, don't keep it if it's not of the current tradition
      if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
        return null;
      }
      
      // Filter children recursively
      const filteredChildren = node.children
        .map(filterTreeByTradition)
        .filter(Boolean);
      
      // If no children left after filtering, don't keep this node
      if (filteredChildren.length === 0) {
        return null;
      }
      
      // Create a modified node with only the filtered children
      return {
        ...node,
        children: filteredChildren
      };
    };
    
    // Make a deep copy to prevent modifying the original
    const deepCopy = JSON.parse(JSON.stringify(data));
    const filteredTree = filterTreeByTradition(deepCopy);
    
    if (filteredTree) {
      processedData = filteredTree;
    }
  } else {
    // For other views, do the standard traversal
    const traverseAndEnhance = (node, parentInfo = {}) => {
      if (!node) return;
      
      // Apply parent genre/tradition if not present on node
      if (parentInfo.genre && !node.genre) node.genre = parentInfo.genre;
      if (parentInfo.tradition && !node.tradition) node.tradition = parentInfo.tradition;
      
      // Try to derive tradition from genre if possible
      if (node.genre && !node.tradition) {
        const genreTradition = getTraditionForGenre(node.genre);
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
      
      // For Galician "pezas_" patterns
      if (node.name && node.name.includes('pezas_') && !node.genre) {
        const parts = node.name.split('_');
        if (parts.length > 2) {
          const possibleGenre = parts[2].toLowerCase();
          node.tradition = "galician";
          node.genre = possibleGenre;
        }
      }
      
      // Create display names
      if (node.name && !node.display_name) {
        if (node.name.includes('.krn')) {
          const parts = node.name.split('_');
          if (parts.length >= 3) {
            const displayParts = parts.slice(2);
            const displayName = displayParts
              .join(' ')
              .replace(/\.krn$/, '')
              .replace(/_/g, ' ')
              .replace(/__/g, ' - ');
            node.display_name = displayName.charAt(0).toUpperCase() + displayName.slice(1);
          } else {
            node.display_name = node.name.replace(/\.krn$/, '');
          }
        } else {
          node.display_name = node.name;
        }
      }
      
      // Process children recursively
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => traverseAndEnhance(child, {
          genre: node.genre,
          tradition: node.tradition
        }));
      }
    };
    
    traverseAndEnhance(processedData);
  }
  
  // Set root name if missing
  if (!processedData.name) {
    if (currentView.value === 'traditions') {
      processedData.name = "Folk Music Traditions";
    } else if (currentView.value === 'tradition' && currentTradition.value) {
      processedData.name = `${traditions[currentTradition.value].name} Genres`;
    } else if (currentView.value === 'genre' && currentGenre.value) {
      processedData.name = `${currentGenre.value.charAt(0).toUpperCase() + currentGenre.value.slice(1)} Scores`;
    } else {
      processedData.name = "Music Phylogenetic Tree";
    }
  }
  
  return processedData;
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
  
  // Use findAvailableTrees to get the appropriate tree file
  findAvailableTrees().then(treeFile => {
    if (!treeFile) {
      console.log("No suitable tree file found, creating custom tree");
      createCustomGenreTree(tradition);
      return;
    }
    
    console.log(`Loading tradition tree from file: ${treeFile}`);
    
    fetch(`/preprocessed_data/${treeFile}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(jsonData => {
        // Process and display the loaded tree
        processAndDisplayGenreTree(jsonData, tradition);
      })
      .catch(err => {
        console.error(`Error loading tree: ${err.message}`);
        createCustomGenreTree(tradition);
      });
  });
}

// Function to process and display a genre tree
function processAndDisplayGenreTree(jsonData, tradition) {
  // Handle the case where the JSON data might be organized differently
  // than what our visualization expects
  if (jsonData.name) {
    // The file has a proper tree structure, proceed with processing
    const processedData = processTreeData(jsonData);
    
    // Enhance the tree with tradition-specific information
    enhanceGenreTree(processedData, tradition);
    
    treeData.value = processedData;
    dataLoaded.value = true;
    isLoading.value = false;
    nextTick(() => renderTree(treeData.value, treeContainer.value)); // FIXED: Added parameters
  } else {
    // The file might have a different structure - try to convert it
    console.log("JSON data doesn't have expected tree structure, trying to convert");
    try {
      const convertedTree = convertToGenreTree(jsonData, tradition);
      treeData.value = convertedTree;
      dataLoaded.value = true;
      isLoading.value = false;
      nextTick(() => renderTree(treeData.value, treeContainer.value));
    } catch (convError) {
      console.error("Failed to convert data to tree:", convError);
      createCustomGenreTree(tradition);
    }
  }
}

// Function to create a custom genre tree when no files are available
function createCustomGenreTree(tradition) {
  console.log("Creating custom genre tree for", tradition);
  const traditionGenres = traditions[tradition]?.genres || [];
  const traditionColor = traditions[tradition]?.color || "#999";
  
  // Create root node
  const genreTree = {
    name: `${traditions[tradition]?.name || tradition.toUpperCase()} Genres`,
    tradition: tradition,
    color: traditionColor,
    children: []
  };
  
  // Add genres as a cluster with connections to each other
  // First we add a central node to connect all genres
  const centralNode = {
    name: "Genres",
    tradition: tradition,
    color: traditionColor,
    children: []
  };
  
  // Then add each genre as a child of the central node
  traditionGenres.forEach(genre => {
    centralNode.children.push({
      name: genre.charAt(0).toUpperCase() + genre.slice(1),
      genre: genre.toLowerCase(),
      tradition: tradition,
      color: traditionColor,
      display_name: genre.charAt(0).toUpperCase() + genre.slice(1)
    });
  });
  
  // Add the central node to the root
  genreTree.children.push(centralNode);
  
  treeData.value = genreTree;
  dataLoaded.value = true;
  isLoading.value = false;
  nextTick(() => renderTree(treeData.value, treeContainer.value)); // FIXED: Added parameters
}

// Function to enhance a tree with tradition-specific information
function enhanceGenreTree(tree, tradition) {
  if (!tree) return;
  
  // Set the tradition property on all nodes recursively
  const enhanceNode = (node) => {
    if (!node) return;
    
    // Set tradition if not already set
    if (!node.tradition) node.tradition = tradition;
    
    // Set color based on tradition
    if (!node.color) node.color = traditions[tradition]?.color || "#999";
    
    // Set display_name if not present
    if (!node.display_name && node.name) {
      node.display_name = node.name.charAt(0).toUpperCase() + node.name.slice(1);
    }
    
    // If node name is a genre name, mark it as such
    if (node.name) {
      const nameLower = node.name.toLowerCase();
      if (traditions[tradition]?.genres.includes(nameLower)) {
        node.genre = nameLower;
      }
    }
    
    // Process children recursively
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => enhanceNode(child));
    }
  };
  
  enhanceNode(tree);
}

// Function to convert other data formats to a genre tree
function convertToGenreTree(data, tradition) {
  // This function would handle various JSON formats and convert them
  // to the hierarchical structure we need
  
  // Simple approach: check if it's an array of genres or relationships
  if (Array.isArray(data)) {
    const genreTree = {
      name: `${traditions[tradition]?.name || tradition.toUpperCase()} Genres`,
      tradition: tradition,
      color: traditions[tradition]?.color || "#999",
      children: []
    };
    
    data.forEach(item => {
      // Try to extract genre information from the item
      let genreName = item;
      if (typeof item === 'object') {
        // Try to find a property that might contain the genre name
        genreName = item.name || item.genre || item.id || "Unknown";
      }
      
      genreTree.children.push({
        name: genreName.charAt(0).toUpperCase() + genreName.slice(1),
        genre: genreName.toLowerCase(),
        tradition: tradition,
        color: traditions[tradition]?.color || "#999"
      });
    });
    
    return genreTree;
  }
  
  // If it's not a recognized format, throw an error
  throw new Error("Unrecognized data format for genre tree");
}

function navigateToGenre(genre) {
  selectedNode.value = null;
  currentGenre.value = genre;
  currentView.value = 'genre';
  navigationHistory.value = [];
  isZoomedToNode.value = false;
  
  // In the third level abstraction, we want to see the scores for this genre
  // Look for a score tree specific to this genre
  loadTreeData();
}

function navigateToBreadcrumb(crumb) {
  selectedNode.value = null;
  currentView.value = crumb.view;
  
  if (crumb.view === 'traditions') {
    currentTradition.value = null;
    currentGenre.value = null;
    loadTreeData();
  } else if (crumb.view === 'tradition') {
    currentTradition.value = crumb.tradition;
    currentGenre.value = null;
    navigateToTradition(crumb.tradition);
  } else if (crumb.view === 'genre' && crumb.tradition && crumb.genre) {
    currentTradition.value = crumb.tradition;
    navigateToGenre(crumb.genre);
  }
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
// Update handleNodeClick for better navigation between levels
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
  
  // Handle navigation based on node type
  if (currentView.value === 'traditions' && d.data.tradition) {
    setTimeout(() => navigateToTradition(d.data.tradition), 1000);
  } 
  else if (currentView.value === 'tradition' && d.data.genre) {
    setTimeout(() => navigateToGenre(d.data.genre.toLowerCase()), 1000);
  }
  // Additional navigation options for exploring relationships between nodes
  else if (d.data.relationship || d.data.type === 'relationship') {
    // If it's a relationship node, show information about the relationship
    console.log('Relationship node clicked:', d.data);
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
  
  // Process the structure of the tree
  const treeLayout = d3.tree();
  
  // Special handling for traditions view to ensure correct layout
  if (currentView.value === 'traditions') {
    // For traditions view, make it a horizontal tree with appropriate sizing
    treeLayout.size([containerHeight * 0.5, containerWidth * 0.4]);
    
    // Add links between nodes
    g.selectAll('.link')
      .data(treeLayout(root).links())
      .enter()
      .append('path')
      .attr('class', d => {
        const targetTradition = d.target.data.tradition || 
                               (d.target.children && d.target.children[0].data.tradition);
        return `link ${targetTradition || 'default'}`;
      })
      .attr("d", d => {
        return "M" + d.source.y + "," + d.source.x
          + "C" + (d.source.y + d.target.y) / 2 + "," + d.source.x
          + " " + (d.source.y + d.target.y) / 2 + "," + d.target.x
          + " " + d.target.y + "," + d.target.x;
      })
      .attr("fill", "none")
      .attr("stroke", d => {
        if (d.target.data.tradition) return traditions[d.target.data.tradition]?.color;
        if (d.target.children) {
          // For branch nodes (like Celtic-Iberian), use a gradient or neutral color
          return "#777";
        }
        return "#999";
      })
      .attr("stroke-width", d => d.target.data.tradition ? 2.5 : 2)
      .attr("stroke-opacity", 0.8);
    
    // Add nodes
    const node = g.selectAll('.node')
      .data(treeLayout(root).descendants())
      .enter()
      .append('g')
      .attr('class', d => {
        return `node ${d.children ? 'node--internal' : 'node--leaf'} ${d.data.tradition || ''}`;
      })
      .attr('transform', d => `translate(${d.y}, ${d.x})`)
      .on('click', handleNodeClick);
    
    // Add circles for nodes
    node.append('circle')
    .attr('r', d => {
      // Make genre nodes (leaf nodes) slightly larger
      if (!d.children && d.data.genre) {
        return 6; // Larger radius for genre nodes
      }
      // Standard size for other nodes
      return d.children ? 7 : 5;
    })
    .attr('fill', d => {
      // Your existing node fill logic
      if (d.data.tradition) {
        return traditions[d.data.tradition]?.color || '#999';
      } 
      else if (d.data.genre) {
        const genre = genres.value.find(g => g.name === d.data.genre);
        return genre ? genre.color : '#999';
      }
      else if (d.data.name && d.data.name !== '' && currentView.value === 'traditions') {
        const genre = genres.value.find(g => g.name === d.data.name);
        return genre ? genre.color : '#999';
      }
      return '#999'; // Default color
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', d => {
      // Give genre nodes a slightly thicker stroke for emphasis
      return !d.children && d.data.genre ? 2 : 1.5;
    });
    
    // Add labels for nodes
    node.append('text')
      .attr('dy', d => {
        // For leaf nodes (genres at the end of branches), center vertically with perfect alignment
        if (!d.children) {
          return '0.31em'; // Fine-tuned vertical alignment
        }
        // For parent nodes, adjust as needed
        return d.children ? '-12' : '15';
      })
      .attr('x', d => {
        // For leaf nodes (genres at the end of branches)
        if (!d.children) {
          return 15; // Slightly increased spacing for better separation
        }
        // For parent nodes, keep existing behavior
        return d.children ? 0 : 10;
      })
      .attr('text-anchor', d => (d.children ? 'middle' : 'start'))
      .attr('dominant-baseline', 'middle') // Add this line for better vertical alignment
      .text(d => {
        if (d.data.display_name) {
          return d.data.display_name;
        } 
        else if (currentView.value === 'traditions' && d.data.name && d.data.name !== '') {
          return d.data.name.charAt(0).toUpperCase() + d.data.name.slice(1);
        }
        else if (d.data.genre) {
          return d.data.genre.charAt(0).toUpperCase() + d.data.genre.slice(1);
        }
        return '';
      })
      .attr('font-size', d => {
        // Slightly larger font for genres to improve readability
        return !d.children && (d.data.genre || (currentView.value === 'traditions' && d.data.name && d.data.name !== '')) ? 
          '13px' : '12px';
      })
      .attr('fill', '#333');
    
    // Add tooltips
    node.append('title')
      .text(d => {
        if (d.data.tradition) {
          return `${d.data.name}\nClick to explore ${d.data.name} genres`;
        }
        return d.data.name;
      });
  } 
  else {
    // For other views, continue with the existing implementation
    if (currentView.value === 'tradition') {
      treeLayout.size([containerHeight * 0.8, containerWidth * 0.7]);
    } else {
      treeLayout.size([containerHeight * 0.9, containerWidth * 0.7]);
    }
    
    const treeData = treeLayout(root);
    
    // Add links
    g.selectAll('.link')
      .data(treeData.links())
      .enter()
      .append('path')
      .attr('class', d => {
        let tradition = "unknown";
        
        if (d.target.data.tradition) {
          tradition = d.target.data.tradition;
        } else if (d.target.parent && d.target.parent.data.tradition) {
          tradition = d.target.parent.data.tradition;
        } else if (currentView.value === 'tradition' || currentView.value === 'genre') {
          tradition = currentTradition.value;
        }
        
        return `link ${tradition}`;
      })
      .attr("d", d => {
        return "M" + d.source.y + "," + d.source.x
          + "C" + (d.source.y + d.target.y) / 2 + "," + d.source.x
          + " " + (d.source.y + d.target.y) / 2 + "," + d.target.x
          + " " + d.target.y + "," + d.target.x;
      })
      .attr("fill", "none")
      .attr("stroke", d => {
        if (d.target.data.tradition) return traditions[d.target.data.tradition]?.color;
        if (d.target.parent && d.target.parent.data.tradition) 
          return traditions[d.target.parent.data.tradition]?.color;
        if (currentView.value === 'tradition' || currentView.value === 'genre') 
          return traditions[currentTradition.value]?.color;
        return "#555";
      })
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.8);
    
    // Add nodes
    const node = g.selectAll('.node')
      .data(treeData.descendants())
      .enter()
      .append('g')
      .attr('class', d => {
        let traditionClass = "";
        
        if (d.data.tradition) traditionClass = d.data.tradition;
        else if (d.parent && d.parent.data.tradition) traditionClass = d.parent.data.tradition;
        else if (currentView.value === 'tradition' || currentView.value === 'genre') {
          traditionClass = currentTradition.value;
        }
        
        return `node ${d.children ? "node--internal" : "node--leaf"} ${traditionClass}`;
      })
      .attr('transform', d => `translate(${d.y}, ${d.x})`)
      .on('click', handleNodeClick);
    
    // Add circles for nodes
    node.append('circle')
      .attr('r', d => {
        // Make genre nodes (leaf nodes) slightly larger
        if (!d.children && d.data.genre) {
          return 6; // Larger radius for genre nodes
        }
        // Standard size for other nodes
        return d.children ? 7 : 5;
      })
      .attr('fill', d => {
        if (d.data.tradition) {
          return traditions[d.data.tradition]?.color || '#999';
        } 
        else if (d.data.genre) {
          const genre = genres.value.find(g => g.name === d.data.genre);
          return genre ? genre.color : '#999';
        }
        else if (d.data.name && d.data.name !== '' && currentView.value === 'traditions') {
          const genre = genres.value.find(g => g.name === d.data.name);
          return genre ? genre.color : '#999';
        }
        return '#999'; // Default color
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', d => {
        // Give genre nodes a slightly thicker stroke for emphasis
        return !d.children && d.data.genre ? 2 : 1.5;
      });
    
    // Add labels to nodes - FIXED with updated alignment
    node.append('text')
      .attr('dy', d => {
        // For leaf nodes (genres at the end of branches), center vertically
        if (!d.children) {
          return '0.31em'; // Fine-tuned vertical alignment
        }
        // For parent nodes, keep existing behavior
        return d.children ? -12 : 15;
      })
      .attr('x', d => {
        // For leaf nodes (genres at the end of branches)
        if (!d.children) {
          return 15; // Consistent spacing to the right of the node
        }
        // For parent nodes, keep existing behavior
        return d.children ? 0 : 10;
      })
      .attr('text-anchor', d => (d.children ? 'middle' : 'start'))
      .attr('dominant-baseline', 'middle') // Add this for better vertical alignment
      .text(d => {
        if (d.data.display_name) {
          return d.data.display_name;
        } 
        else if (currentView.value === 'traditions' && d.data.name && d.data.name !== '') {
          return d.data.name.charAt(0).toUpperCase() + d.data.name.slice(1);
        }
        else if (d.data.genre) {
          return d.data.genre.charAt(0).toUpperCase() + d.data.genre.slice(1);
        }
        return '';
      })
      .attr('font-size', d => {
        // Slightly larger font for genres to improve readability
        return !d.children && (d.data.genre || (currentView.value === 'traditions' && d.data.name && d.data.name !== '')) ? 
          '13px' : '12px';
      })
      .attr('fill', '#333');
      
    // Add tooltips
    node.append('title')
      .text(d => {
        if (d.data.tradition) {
          return `${d.data.name || d.data.genre}\nTradition: ${traditions[d.data.tradition]?.name || d.data.tradition}`;
        }
        return d.data.name || d.data.genre || '';
      });
  }
  
  // Initial centering of the tree
  centerTree(svg, g, containerWidth, containerHeight);
}

// UI CONTROL FUNCTIONS
function addZoomControls(svg, width) {
  const zoomControls = svg.append('g')
    .attr('class', 'zoom-controls')
    .attr('transform', `translate(${width - 100}, 30)`);
    
  // Zoom in button
  zoomControls.append('rect')
    .attr('x', 0).attr('y', 0).attr('width', 30).attr('height', 30)
    .attr('fill', '#f0f0f0').attr('stroke', '#ccc').attr('rx', 4).attr('cursor', 'pointer')
    .on('click', () => svg.transition().duration(300).call(zoomBehavior.value.scaleBy, 1.3));
    
  zoomControls.append('text')
    .attr('x', 15).attr('y', 20).attr('text-anchor', 'middle')
    .attr('pointer-events', 'none').text('+');
    
  // Zoom out button
  zoomControls.append('rect')
    .attr('x', 40).attr('y', 0).attr('width', 30).attr('height', 30)
    .attr('fill', '#f0f0f0').attr('stroke', '#ccc').attr('rx', 4).attr('cursor', 'pointer')
    .on('click', () => svg.transition().duration(300).call(zoomBehavior.value.scaleBy, 0.7));
    
  zoomControls.append('text')
    .attr('x', 55).attr('y', 20).attr('text-anchor', 'middle')
    .attr('pointer-events', 'none').text('-');
}

function addNavigationControls(svg, height) {
  const navControls = svg.append('g')
    .attr('class', 'nav-controls')
    .attr('transform', `translate(20, ${height - 50})`)
    .style('display', isZoomedToNode.value ? null : 'none');
  
  navControls.append('rect')
    .attr('width', 80).attr('height', 30).attr('rx', 4)
    .attr('fill', '#f0f0f0').attr('stroke', '#ccc').attr('cursor', 'pointer')
    .on('click', () => goBack());
    
  navControls.append('text')
    .attr('x', 40).attr('y', 20).attr('text-anchor', 'middle')
    .attr('pointer-events', 'none').text('Back')
    .style('font-size', '14px').style('font-family', 'Arial, sans-serif');
}

function addViewLegend(svg, view) {
  const legendGroup = svg.append('g')
    .attr('class', 'tradition-legend')
    .attr('transform', `translate(20, 20)`);
  
  let legendY = 0;
  const legendItemHeight = 20;
  
  if (view === 'traditions') {
    Object.entries(traditions).forEach(([key, tradition]) => {
      legendGroup.append('rect')
        .attr('width', 14).attr('height', 14).attr('x', 2).attr('y', legendY + 1)
        .attr('fill', tradition.color).attr('stroke', '#333').attr('stroke-width', 0.5);
        
      legendGroup.append('text')
        .attr('x', 22).attr('y', legendY + 12).text(tradition.name)
        .style('font-size', '12px').style('font-family', 'Arial, sans-serif');
        
      legendY += legendItemHeight;
    });
  } else if (view === 'tradition') {
    const tradition = traditions[currentTradition.value];
    if (!tradition) return;
    
    legendGroup.append('rect')
      .attr('width', 14).attr('height', 14).attr('x', 2).attr('y', legendY + 1)
      .attr('fill', tradition.color).attr('stroke', '#333').attr('stroke-width', 0.5);
      
    legendGroup.append('text')
      .attr('x', 22).attr('y', legendY + 12).text(tradition.name)
      .style('font-size', '12px').style('font-family', 'Arial, sans-serif');
      
    legendY += legendItemHeight;
    
    legendGroup.append('text')
      .attr('x', 2).attr('y', legendY + 12).text('Click on a genre to explore its scores')
      .style('font-size', '10px').style('font-style', 'italic')
      .style('font-family', 'Arial, sans-serif');
  } else if (view === 'genre') {
    const tradition = traditions[currentTradition.value];
    if (!tradition) return;
    
    legendGroup.append('rect')
      .attr('width', 14).attr('height', 14).attr('x', 2).attr('y', legendY + 1)
      .attr('fill', tradition.color).attr('stroke', '#333').attr('stroke-width', 0.5);
      
    legendGroup.append('text')
      .attr('x', 22).attr('y', legendY + 12)
      .text(`${currentGenre.value.charAt(0).toUpperCase() + currentGenre.value.slice(1)} (${tradition.name})`)
      .style('font-size', '12px').style('font-family', 'Arial, sans-serif');
  }
}

// TREE ELEMENT DRAWING
function drawLinks(treeGroup, root) {
  treeGroup.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", d => {
      let tradition = "unknown";
      
      if (currentView.value === 'traditions') {
        tradition = d.target.data.tradition || 
                   (d.target.parent && d.target.parent.data.tradition) || "unknown";
      } else if (currentView.value === 'tradition' || currentView.value === 'genre') {
        tradition = currentTradition.value;
      }
      
      return `link ${tradition}`;
    })
    .attr("d", d => {
      return "M" + d.source.y + "," + d.source.x
        + "C" + (d.source.y + d.target.y) / 2 + "," + d.source.x
        + " " + (d.source.y + d.target.y) / 2 + "," + d.target.x
        + " " + d.target.y + "," + d.target.x;
    })
    .attr("fill", "none")
    .attr("stroke", d => {
      if (currentView.value === 'traditions') {
        if (d.target.data.tradition) return traditions[d.target.data.tradition]?.color;
        if (d.target.parent && d.target.parent.data.tradition) return traditions[d.target.parent.data.tradition]?.color;
      } else if (currentView.value === 'tradition' || currentView.value === 'genre') {
        return traditions[currentTradition.value]?.color;
      }
      return "#555";
    })
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.8);
}

function drawNodes(treeGroup, root) {
  const node = treeGroup.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", d => {
      let traditionClass = "";
      
      if (currentView.value === 'traditions') {
        if (d.data.tradition) traditionClass = d.data.tradition;
        else if (d.parent && d.parent.data.tradition) traditionClass = d.parent.data.tradition;
      } else if (currentView.value === 'tradition' || currentView.value === 'genre') {
        traditionClass = currentTradition.value;
      }
      
      return `node ${d.children ? "node--internal" : "node--leaf"} ${traditionClass}`;
    })
    .attr("transform", d => `translate(${d.y}, ${d.x})`)
    .on("click", handleNodeClick);
  
  node.append("circle")
    .attr("r", d => d.children ? 7 : 5)
    .attr("fill", d => {
      if (currentView.value === 'traditions') {
        if (d.data.tradition) return traditions[d.data.tradition]?.color;
        if (d.parent && d.parent.data.tradition) return traditions[d.parent.data.tradition]?.color;
      } else if (currentView.value === 'tradition' || currentView.value === 'genre') {
        return traditions[currentTradition.value]?.color || "#999";
      }
      return d.children ? "#555" : "#999";
    })
    .attr("stroke", "#333")
    .attr("stroke-width", 1);
  
  // Only add text to nodes with actual names
  node.filter(d => d.data.name !== "")
    .append("text")
    .attr("dy", ".35em")
    .attr("x", d => d.children ? -15 : 15)
    .attr("text-anchor", d => d.children ? "end" : "start")
    .text(d => d.data.display_name || d.data.name)
    .style("font-size", "12px")
    .style("pointer-events", "none");
  
  node.append("title")
    .text(d => {
      let info = `Name: ${d.data.display_name || d.data.name}`;
      
      if (currentView.value === 'traditions') {
        if (d.data.tradition) info += `\nTradition: ${traditions[d.data.tradition]?.name || d.data.tradition}`;
      } else if (currentView.value === 'tradition') {
        info += `\nTradition: ${traditions[currentTradition.value]?.name || currentTradition.value}`;
        if (d.data.genre) info += `\nGenre: ${d.data.genre}`;
      } else if (currentView.value === 'genre') {
        info += `\nGenre: ${currentGenre.value}`;
        if (d.data.tradition) info += `\nTradition: ${traditions[d.data.tradition]?.name || d.data.tradition}`;
      }
      
      // Add any other attributes that might be present
      if (d.data.length) info += `\nLength: ${d.data.length}`;
      
      return info;
    });
}

// HELPER FUNCTIONS
function centerTree(svg, g, width, height) {
  const bounds = g.node().getBBox();
  const dx = bounds.width;
  const dy = bounds.height;
  const x = bounds.x;
  const y = bounds.y;
  
  // Calculate the appropriate scale and translate
  const scale = 0.9 / Math.max(dx / width, dy / height);
  const translate = [width / 2 - scale * (x + dx / 2), height / 2 - scale * (y + dy / 2)];
  
  // Apply the zoom transformation
  svg.transition().duration(750).call(
    zoomBehavior.value.transform,
    d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
  );
  
  currentZoom.value = scale;
}

function fitTreeToView(svg, zoomGroup, margin, customZoom = null) {
  const bounds = zoomGroup.node().getBBox();
  const containerWidth = treeContainer.value.clientWidth;
  const containerHeight = treeContainer.value.clientHeight;
  
  const fullWidth = bounds.width + margin.left + margin.right;
  const fullHeight = bounds.height + margin.top + margin.bottom;
  
  let scale = 0.85 / Math.max(fullWidth / containerWidth, fullHeight / containerHeight);
  if (customZoom !== null && scale > customZoom) scale = customZoom;
  
  svg.call(
    zoomBehavior.value.transform,
    d3.zoomIdentity.translate(-bounds.x * scale + margin.left, -bounds.y * scale + margin.top).scale(scale)
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
    .style('opacity', d => !d.data.genre ? 0.3 : selectedGenres.includes(d.data.genre.toLowerCase()) ? 1 : 0.2);
  
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

watch(featureType, (newFeature) => {
  console.log('Feature type changed to:', newFeature);
  // Reload tree data with the new feature type
  loadTreeData();
}, { immediate: true });

watch(
  [currentView, currentTradition, currentGenre],
  () => {
    // Force the breadcrumbs to update
    nextTick(() => {
      // The breadcrumbs should now reflect the current view, tradition, and genre
      console.log('Navigation state updated:', { 
        view: currentView.value, 
        tradition: currentTradition.value, 
        genre: currentGenre.value,
        breadcrumbs: breadcrumbs.value
      });
    });
  }
);

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
    
  setTimeout(() => {
    if (treeContainer.value) {
      currentView.value = 'traditions';
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
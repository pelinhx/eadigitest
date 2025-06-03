<script setup>
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import * as d3 from 'd3';
import '../assets/visualization.css';
import { processTreeData, getTraditionForGenre } from '../utils/treeUtils.js';
import { generateTreeFilePath, createTreeUpdater } from '../utils/pathGeneratorUtils.js';

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
const currentScore = ref(null);
const scoreFilePath = ref('');
const scoreLoading = ref(false);
const scoreError = ref(null);
const scoreRenderer = ref(null);
const scoreData = ref(null);
const compareMode = ref(false);
const selectedScores = ref([]);
const maxCompareScores = 3;
const comparisonRenderers = ref([]);
const comparisonScoreData = ref([]);

// DATA DEFINITIONS - Keep these unchanged
const traditions = {
  irish: {
    name: "Irish Tradition",
    color: "#44E444",
    genres: ['barndance', 'hornpipe', 'jig', 'march', 'mazurka', 'polka', 'reel', 'slide', 'strathspey', 'waltz']
  },
  galician: {
    name: "Galician Tradition",
    color: "#3498EF",
    genres: ['alalas', 'foliadas', 'jotas', 'marchas', 'mazurcas', 'muineiras', 'pasacorredoiras', 'pasodobles', 'polca', 'rumbas', 'valses']
  }
};

// Keep the tradition tree structure unchanged
const traditionsTree = {
  name: "Folk Music Traditions",
  children: [
    {
      name: "",
      children: [
        { name: "Irish Tradition", tradition: "irish", color: traditions.irish.color },
        { name: "Galician Tradition", tradition: "galician", color: traditions.galician.color }
      ]
    }
  ]
};

// COMPUTED PROPERTIES - Keep these unchanged
const selectedFeature = computed(() => props.sidebarRef?.selectedFeature);
const datasets = computed(() => props.sidebarRef?.datasets || []);
const genres = computed(() => props.sidebarRef?.genres || []);
const featureType = computed(() => props.sidebarRef?.featureFilenamePattern || 'chromatic');
const levelType = computed(() => props.sidebarRef?.levelFilenamePattern || 'note');

const featureTypeDisplay = computed(() => {
  const featureMap = {
    'chromatic': 'Chromatic Analysis',
    'rhythmic': 'Rhythmic Analysis',
    'chromatic_rhythmic': 'Chromatic & Rhythmic Analysis'
  };
  return featureMap[featureType.value] || 'Analysis';
});

// Keep breadcrumbs computed unchanged - it's needed for navigation
const breadcrumbs = computed(() => {
  // Force reactivity by explicitly referencing reactive variables
  const viewState = currentView.value;
  const genreState = currentGenre.value;
  const traditionState = currentTradition.value;
  const scoreState = currentScore.value;
  
  console.log(`Computing breadcrumbs - View: ${viewState}, Genre: ${genreState}, Tradition: ${traditionState}, Score: ${scoreState?.name}`);
  
  // Always start with the home/traditions crumb
  const crumbs = [
    { text: 'Traditions', view: 'traditions' }
  ];
  
  // Handle combined view (Celtic)
  if (viewState === 'combined') {
    crumbs.push({
      text: 'Celtic Traditions',
      view: 'combined',
      combined: true
    });
  }
  
  // Handle tradition view
  if (traditionState) {
    crumbs.push({
      text: traditions[traditionState]?.name || traditionState,
      view: 'tradition',
      tradition: traditionState
    });
  }
  
  // Handle genre view
  if ((viewState === 'genre' || viewState === 'score' || viewState === 'compare') && genreState) {
    const capitalizedGenre = genreState?.charAt(0).toUpperCase() + genreState?.slice(1);
    if (capitalizedGenre) {
      crumbs.push({
        text: capitalizedGenre, 
        view: 'genre',
        tradition: traditionState,
        genre: genreState
      });
    }
  }
  
  // Handle score view
  if (viewState === 'score' && scoreState) {
    crumbs.push({
      text: getScoreDisplayName(scoreState),
      view: 'score',
      tradition: traditionState,
      genre: genreState,
      score: scoreState
    });
  }
  
  // Handle compare view
  if (viewState === 'compare') {
    crumbs.push({
      text: 'Score Comparison',
      view: 'compare',
      tradition: traditionState,
      genre: genreState
    });
  }
  
  console.log('Computed breadcrumbs result:', JSON.stringify(crumbs));
  return crumbs;
});

// Keep utility functions
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

// Keep treeUpdater
const treeUpdater = createTreeUpdater((data, pathInfo) => {
  // This function will be called when a tree is loaded
  currentTreeData.value = data;
  const processedData = enhanceTree(data);
  treeData.value = processedData;
  renderTree(processedData, treeContainer.value);
  console.log(`Rendered tree from: ${pathInfo.workingPath}`);
});

function getScoreDisplayName(scoreNode) {
  if (!scoreNode) return 'Unknown Score';
  
  if (scoreNode.display_name) return scoreNode.display_name;
  if (scoreNode.title) return scoreNode.title;
  
  if (scoreNode.name) {
    const nameWithoutExt = scoreNode.name.replace(/\.(musicxml|xml|krn)$/, '');
    
    // Handle underscore names
    if (nameWithoutExt.includes('_')) {
      const parts = nameWithoutExt.split('_');
      if (parts.length >= 3 && parts[0] === 'pezas') {
        return capitalizeWords(parts[2].replace(/-/g, ' '));
      }
      return capitalizeWords(parts.slice(1).join(' '));
    }
    
    // Handle dash names
    if (nameWithoutExt.includes('-')) {
      return capitalizeWords(nameWithoutExt.replace(/-/g, ' '));
    }
    
    return capitalizeFirstLetter(nameWithoutExt);
  }
  
  return scoreNode.id ? `Score ${scoreNode.id}` : 'Unknown Score';
}

// Updated navigateToScore function with improved error handling
async function navigateToScore(scoreNode) {
  console.log(`Navigating to score:`, scoreNode);
  
  try {
    // Set loading state
    scoreLoading.value = true;
    scoreError.value = null;
    
    if (!scoreNode) {
      throw new Error('No score node provided');
    }
    
    // Log current score before it changes
    console.log(`Score name: ${scoreNode.name}, genre: ${scoreNode.genre}, tradition: ${scoreNode.tradition}`);
    
    // Add more context to help with debugging
    console.log(`Current view: ${currentView.value}, genre: ${currentGenre.value}, tradition: ${currentTradition.value}`);
    
    // Update state for breadcrumb navigation
    currentScore.value = scoreNode;
    currentView.value = 'score';
    
    // Log after state change
    console.log(`Updated to score view: ${scoreNode.name}`);
    
    // Wait a tick to ensure UI updates before proceeding
    await nextTick();
    
    // Debug score loading
    await debugScoreLoading(scoreNode);
    
    // Get the file path
    const scoreInfo = mapScoreToFilePath(scoreNode);
    
    if (!scoreInfo.isValid) {
      throw new Error('Could not determine score file path');
    }
    
    scoreFilePath.value = scoreInfo.fullPath;
    console.log(`Loading score from: ${scoreInfo.fullPath}`);
    
    // Load the content
    const content = await loadScoreContent(scoreInfo.fullPath);
    
    if (!content) {
      throw new Error('Empty score content received. Check that MusicXML files exist in the expected location.');
    }
    
    // Perform one final validation
    if (!content.includes('<?xml') || 
        (!content.includes('<score-partwise') && 
         !content.includes('<opus') && 
         !content.includes('<music-score'))) {
      throw new Error('Invalid MusicXML format. The file found does not appear to be a valid MusicXML document.');
    }
    
    console.log(`Score loaded successfully, size: ${content.length} bytes`);
    
    // Store the content
    scoreData.value = content;
    
    // Render it
    renderScore(content);
    
    // Mark loading as complete
    scoreLoading.value = false;
  } catch (err) {
    console.error('Error navigating to score:', err);
    scoreError.value = `${err.message}
    
    Please make sure your MusicXML files are correctly placed in one of these directories:
    - /preprocessed_data/folksheetmusic/irish/${currentGenre.value}/
    - /preprocessed_data/folksheetmusic/galician/${currentGenre.value}/
    - /preprocessed_data/folksheetmusic/musicxml_irl_dataset/
    - /preprocessed_data/folksheetmusic/musicxml_gal_dataset/`;
    
    scoreLoading.value = false;
  }
}

// MODIFIED navigateToBreadcrumb with simplified score handling
function navigateToBreadcrumb(crumb) {
  console.log("Navigating to breadcrumb:", crumb);
  
  try {
    // Handle score view navigation
    if (crumb.view === 'score' && crumb.score) {
      // We're already at this score
      if (currentView.value === 'score' && currentScore.value === crumb.score) {
        return;
      }
      
      // Navigate to this score
      navigateToScore(crumb.score);
      return;
    }
    
    // When we navigate away from score view, clean up score-related state
    if (currentView.value === 'score') {
      currentScore.value = null;
    }
    
    if (crumb.view === 'traditions') {
      // Navigate to traditions view
      currentTradition.value = null;
      currentGenre.value = null;
      currentView.value = 'traditions';
      
      // Reset any selection and navigation history
      selectedNode.value = null;
      navigationHistory.value = [];
      isZoomedToNode.value = false;
      
      // Use the hardcoded traditionsTree for top level
      console.log('Loading traditions view from breadcrumb');
      currentTreeData.value = traditionsTree;
      renderTree(traditionsTree, treeContainer.value);
      dataLoaded.value = true;
      return;
    }
    else if (crumb.view === 'combined') {
      // Special case for the combined node containing Irish and Galician
      currentTradition.value = null;
      currentGenre.value = null;
      currentView.value = 'combined';
      
      // Reset any selection and navigation history
      selectedNode.value = null;
      navigationHistory.value = [];
      isZoomedToNode.value = false;
      
      // Load the special combined tree
      console.log('Loading combined Irish-Galician view from breadcrumb');
      loadSpecialTree();
      return;
    }
    else if (crumb.view === 'tradition' && crumb.tradition) {
      // Navigate to specific tradition view
      currentGenre.value = null;
      currentTradition.value = crumb.tradition;
      currentView.value = 'tradition';
      
      // Reset any selection and navigation history
      selectedNode.value = null;
      navigationHistory.value = [];
      isZoomedToNode.value = false;
      
      // Load the tradition-specific tree
      console.log(`Loading tradition view for ${crumb.tradition} from breadcrumb`);
      loadSpecialTree(crumb.tradition);
      return;
    }
    else if (crumb.view === 'genre' && crumb.genre && crumb.tradition) {
      // We're already at this view, no need to navigate
      if (currentView.value === 'genre' && 
          currentGenre.value === crumb.genre && 
          currentTradition.value === crumb.tradition) {
        return;
      }
      
      // CRITICAL FIX: Set these values in the correct order for proper breadcrumb updates
      currentTradition.value = crumb.tradition;
      currentView.value = 'genre';
      currentGenre.value = crumb.genre;
      
      // Print state for debugging
      console.log("Updated state from breadcrumb navigation:", { 
        view: currentView.value, 
        genre: currentGenre.value, 
        tradition: currentTradition.value 
      });
      
      // Reset any selection and navigation history
      selectedNode.value = null;
      navigationHistory.value = [];
      isZoomedToNode.value = false;
      
      // Force Vue to update the UI with these changes
      nextTick(() => {
        console.log("Breadcrumbs after genre breadcrumb click:", breadcrumbs.value);
        
        // Load tree data for the genre
        console.log(`Loading genre view for ${crumb.genre} in ${crumb.tradition} from breadcrumb`);
        loadGenrePhylogeneticTree(crumb.genre, crumb.tradition, featureType.value, levelType.value);
      });
    }
  } catch (err) {
    console.error("Error navigating via breadcrumb:", err);
    error.value = `Navigation error: ${err.message}`;
  }
}

// Updated findAvailableTrees function to accommodate the nested folder structure
async function findAvailableTrees() {
  try {
    isLoading.value = true;
    
    // Get the current feature and level types from sidebar
    const feature = featureType.value;
    const level = levelType.value;
    let relevantFiles = [];
    let relevantPaths = [];
    
    // Special case mappings remain the same as before
    const specialCaseMappings = {
      'combined_s25_ss75_chromatic': 'genre_tree_combined_s25_ss75_chromatic_rhythmic.json',
      'combined_s25_ss75_chromatic_rhythmic': 'genre_tree_combined_s25_ss75_chromatic_rhythmic.json',
      'combined_s50_ss50_chromatic': 'genre_tree_combined_s50_ss50_chromatic.json',
      'combined_s50_ss50_chromatic_rhythmic': 'genre_tree_combined_s50_ss50_chromatic_rhythmic.json',
      'combined_s75_ss25_chromatic': 'genre_tree_combined_s75_ss25_chromatic.json',
      'combined_s75_ss25_chromatic_rhythmic': 'genre_tree_combined_s75_ss25_chromatic_rhythmic.json',
      'combined_s25_ss75_rhythmic': 'genre_tree_combined_s25_ss75_rhythmic.json',
      'combined_s50_ss50_rhythmic': 'genre_tree_combined_s50_ss50_rhythmic.json',
      'combined_s75_ss25_rhythmic': 'genre_tree_combined_s75_ss25_rhythmic.json',
      'note_chromatic': 'genre_tree_note_chromatic.json',
      'note_chromatic_rhythmic': 'genre_tree_note_chromatic_rhythmic.json',
      'note_rhythmic': 'genre_tree_note_rhythmic.json'
    };
    
    // Check for special case mapping first
    const specialCaseKey = `${level}_${feature}`;
    const specialCaseFile = specialCaseMappings[specialCaseKey];
    console.log(`Current feature/level key: ${specialCaseKey}, matching file: ${specialCaseFile || 'none'}`);
    
    // Determine which files to look for based on the current view
    if (currentView.value === 'traditions' && specialCaseFile) {
      console.log(`Using special case mapping for ${specialCaseKey}: ${specialCaseFile}`);
      relevantFiles = [specialCaseFile];
      // Default traditions path is preprocessed_data/note_level/both/ or combined/both/
      relevantPaths = ['note_level/both/', 'combined/both/', ''];
    }
    else if (currentView.value === 'traditions') {
      // For traditions overview, standard pattern
      relevantFiles = [
        `genre_tree_${level}_${feature}.json`, 
        `${level}_${feature}_all_genres_phylogenetic_tree.json`,
        `note_level_${feature}_all_genres_phylogenetic_tree.json`,
        `combined_s50_ss50_${feature}_all_genres_phylogenetic_tree.json`
      ];
      relevantPaths = ['note_level/both/', 'combined/both/', ''];
    }
    else if (currentView.value === 'tradition') {
      // For specific tradition view, determine correct subfolder
      const traditionPrefix = currentTradition.value?.toLowerCase() || '';
      
      // Files that might exist for tradition-specific views
      relevantFiles = [
        `${traditionPrefix}_genre_tree_${level}_${feature}.json`,
        `genre_tree_${traditionPrefix}_${level}_${feature}.json`,
        `${traditionPrefix}_${level}_${feature}_all_genres_phylogenetic_tree.json`,
        `${traditionPrefix}_combined_s25_ss75_${feature}_all_genres_phylogenetic_tree.json`,
        `${traditionPrefix}_combined_s50_ss50_${feature}_all_genres_phylogenetic_tree.json`,
        `${traditionPrefix}_combined_s75_ss25_${feature}_all_genres_phylogenetic_tree.json`,
        `${traditionPrefix}_note_level_${feature}_all_genres_phylogenetic_tree.json`,
        `${traditionPrefix}_shared_segments_level_${feature}_all_genres_phylogenetic_tree.json`,
        `${traditionPrefix}_structure_level_${feature}_all_genres_phylogenetic_tree.json`
      ];
      
      // Paths specific to the tradition
      relevantPaths = [
        `note_level/${traditionPrefix}/`, 
        `combined/${traditionPrefix}/`,
        `shared_segments/${traditionPrefix}/`,
        `structure_level/${traditionPrefix}/`,
        `note_level/both/`,
        `combined/both/`,
        ''
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
        `${genrePrefix}_${level}_${feature}_scores.json`,
        `${traditionPrefix}_${level}_${feature}_${genrePrefix}.json`
      ];
      
      // Check in genre-specific folders and tradition folders
      relevantPaths = [
        `genre/${traditionPrefix}/`,
        `genre/both/`,
        `note_level/${traditionPrefix}/`,
        `combined/${traditionPrefix}/`,
        `note_level/both/`,
        `combined/both/`,
        ''
      ];
    }
    
    console.log(`Looking for tree files: feature=${feature}, level=${level}, view=${currentView.value}`);
    console.log(`File candidates: ${relevantFiles.join(', ')}`);
    console.log(`Path candidates: ${relevantPaths.join(', ')}`);
    
    availableTrees.value = relevantFiles;
    
    // Detect if we're in development or production
    const isProduction = window.location.hostname !== 'localhost' && 
                        window.location.hostname !== '127.0.0.1';
    
    console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);
    
    // Get last working path if available
    const lastWorkingPath = sessionStorage.getItem('lastWorkingTreePath');
    
    // Base paths depend on environment
    const basePaths = isProduction ? [
      // Production paths
      `${import.meta.env.BASE_URL}preprocessed_data/`,
      `${import.meta.env.BASE_URL}dist/preprocessed_data/`,
      `${import.meta.env.BASE_URL}`,
      `${import.meta.env.BASE_URL}dist/`
    ] : [
      // Development paths
      './preprocessed_data/',
      '../preprocessed_data/',
      'preprocessed_data/',
      './',
      '../'
    ];
    
    // Try each combination of base path, relative path, and file
    for (const basePath of basePaths) {
      for (const relativePath of relevantPaths) {
        for (const file of relevantFiles) {
          try {
            const fullPath = `${basePath}${relativePath}${file}`;
            console.log(`Trying path: ${fullPath}`);
            
            const response = await fetch(fullPath, { cache: 'no-cache' });
            
            if (response.ok) {
              console.log(`✅ Success with path: ${fullPath}`);
              const successPath = `${basePath}${relativePath}`;
              sessionStorage.setItem('lastWorkingTreePath', successPath);
              return { path: successPath, filename: file };
            }
          } catch (err) {
            console.log(`❌ Error with path: ${basePath}${relativePath}${file}`);
            // Continue to the next file or path
          }
        }
      }
    }
    
    // If we get here and we have a lastWorkingPath, try it directly
    if (lastWorkingPath) {
      console.log(`Trying with last working path: ${lastWorkingPath}`);
      
      for (const file of relevantFiles) {
        try {
          const fullPath = `${lastWorkingPath}${file}`;
          console.log(`Trying last working path: ${fullPath}`);
          
          const response = await fetch(fullPath, { cache: 'no-cache' });
          
          if (response.ok) {
            console.log(`✅ Success with last working path: ${fullPath}`);
            return { path: lastWorkingPath, filename: file };
          }
        } catch (err) {
          // Continue to the next file
        }
      }
    }
    
    // If we reach here, no file could be loaded
    console.log('⚠️ Could not find any suitable tree files');
    return null;
    
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
    const treeInfo = await findAvailableTrees();
    
    if (!treeInfo) {
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
    const filePath = `${treeInfo.path}${treeInfo.filename}`;
    console.log(`Loading tree from file: ${filePath}`);
    
    try {
      const response = await fetch(filePath, { cache: 'no-cache' });
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
      console.error(`Error fetching ${filePath}:`, fetchErr);
      
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

//Score Section

// Enhanced mapScoreToFilePath function with comprehensive pattern matching
function mapScoreToFilePath(scoreNode) {
  if (!scoreNode || !scoreNode.name) {
    return { isValid: false };
  }
  
  try {
    // Extract necessary information from the node
    let fileName = '';
    let folderPath = '';
    
    // 1. Determine tradition folder
    const tradition = scoreNode.tradition || currentTradition.value;
    
    if (tradition === 'irish') {
      folderPath = `preprocessed_data/folksheetmusic/irish/`;
    } else if (tradition === 'galician') {
      folderPath = `preprocessed_data/folksheetmusic/galician/`;
    } else {
      console.error(`Unknown tradition: ${tradition}`);
      return { isValid: false };
    }
    
    // 2. Add genre subfolder to path
    const genre = scoreNode.genre || currentGenre.value;
    if (!genre) {
      console.error('No genre specified for score');
      return { isValid: false };
    }
    
    // Complete folder path now includes genre subfolder
    folderPath = `${folderPath}${genre}/`;
    
    // 3. Get the node name for filename generation
    const nodeName = scoreNode.name || '';
    console.log(`Mapping score: tradition=${tradition}, genre=${genre}, name=${nodeName}`);
    
    // 4. IRISH TRADITION HANDLING
    if (tradition === 'irish') {
      // Common patterns for Irish files: genre_Name-With-Hyphens.musicxml
      // Clean the name - remove .krn extension and other patterns
      let cleanName = nodeName
        .replace(/\.krn$/, '')
        .replace(/\.musicxml$/, '')
        .toLowerCase()
        .trim();
      
      // Remove numeric patterns often found in file names
      cleanName = cleanName
        .replace(/\s+1\s+e\s+1$/i, '')        // Remove "1 E 1" suffix
        .replace(/_1_1$/i, '')                // Remove "_1_1" suffix
        .replace(/_2_1$/i, '')                // Remove "_2_1" suffix
        .replace(/_\d+_\d+$/i, '')           // Remove any "_X_Y" pattern at the end
        .replace(/--/g, '-');                // Fix double hyphens
      
      // Format for Irish files follows: genre_Name-With-Hyphens.musicxml
      
      // Check if the name follows a specific pattern like "jig_Scatter-The-Mud.musicxml"
      // First, handle if the name already has the genre prefix
      if (cleanName.toLowerCase().startsWith(genre.toLowerCase() + '_')) {
        // Already has genre prefix, just add extension
        fileName = `${cleanName}.musicxml`;
      } else {
        // Convert spaces to hyphens in the tune name (common pattern in Irish files)
        const nameWithHyphens = cleanName.replace(/\s+/g, '-');
        fileName = `${genre}_${nameWithHyphens}.musicxml`;
      }
      
      // SPECIAL CASES for Irish tradition (observed in your file list)
      if (nodeName.includes("Fandangu")) {
        fileName = "mazurka_Fandangu.musicxml";
      }
      
      if (nodeName.includes("Swedishish")) {
        fileName = "mazurka_Swedishish.musicxml";
      }
      
      // Special case for Kinclaven Brig
      if (nodeName.toLowerCase().includes("kinclaven")) {
        fileName = "barndance_Kinclaven-Brig.musicxml";
      }
      
      // Special case for capitalization patterns seen in many Irish files
      // Example: strathspey_Reel-Of-Tulloch--The.musicxml
      // Example: polka_Polca-Na-Carraige-Bainne.musicxml
      
      // Handle Irish file naming where words are capitalized and hyphenated
      if (genre === 'strathspey' || genre === 'polka') {
        // Special capital letter pattern for these genres
        const camelCaseWords = cleanName.split(/\s+/).map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join('-');
        
        // Try both with and without leading article movement
        const camelCaseHyphenated = `${genre}_${camelCaseWords}`;
        const alternatives = [camelCaseHyphenated];
        
        // Check if the name has a leading "the" that might be moved to the end
        if (cleanName.toLowerCase().startsWith('the ')) {
          const nameWithoutThe = cleanName.substring(4);
          const camelCaseWithArticleAtEnd = nameWithoutThe.split(/\s+/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join('-') + '--The';
          
          alternatives.push(`${genre}_${camelCaseWithArticleAtEnd}`);
        }
        
        // Check if there's a "the" at the end that might be moved
        if (cleanName.toLowerCase().endsWith(' the')) {
          const nameWithoutEndThe = cleanName.substring(0, cleanName.length - 4);
          const theWithRemainingWords = 'The-' + nameWithoutEndThe.split(/\s+/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join('-');
          
          alternatives.push(`${genre}_${theWithRemainingWords}`);
        }
        
        // Set the most likely alternative as the filename
        if (alternatives.length > 1) {
          // Check if we have a name with "The" in it
          if (cleanName.toLowerCase().includes(" the ") || 
              cleanName.toLowerCase().startsWith("the ") || 
              cleanName.toLowerCase().endsWith(" the")) {
            fileName = alternatives[1] + '.musicxml';
          } else {
            fileName = alternatives[0] + '.musicxml';
          }
        } else {
          fileName = alternatives[0] + '.musicxml';
        }
      }
      
      // Check for Irish polka with accent marks (seen in your files)
      if (genre === 'polka' && (nodeName.toLowerCase().includes('báinne') || 
                               nodeName.toLowerCase().includes('bainne'))) {
        fileName = "polka_Polca-Na-Carraige-Báinne.musicxml";
      }
      
      // Check for jig Is-It-A-Jig-Yet pattern
      if (genre === 'strathspey' && nodeName.toLowerCase().includes('is it a jig')) {
        fileName = "strathspey_Is-It-A-Jig-Yet.musicxml";
      }
    } 
    // 5. GALICIAN TRADITION - STREAMLINED APPROACH
    else if (tradition === 'galician') {
      // Clean name - remove extensions and trim
      let cleanName = nodeName
        .replace(/\.(krn|musicxml)$/i, '')
        .trim();
      
      // Check for common patterns
      const hasPartitura = cleanName.toLowerCase().includes('partitura');
      const has1E1 = cleanName.toLowerCase().includes('1 e 1') || 
                     cleanName.toLowerCase().includes('_1_e_1');
      const has2E1 = cleanName.toLowerCase().includes('2 e 1') || 
                     cleanName.toLowerCase().includes('_2_e_1');
      
      // Create a hyphenated version of the name for consistency
      const hyphenName = cleanName.replace(/\s+/g, '-').toLowerCase();
      
      // Basic pattern: genre_name_name-partitura_N_e_1.musicxml
      // Build this pattern based on the name components
      
      // First determine if there's a number in the name (like alala-10, valse-6)
      const numMatch = hyphenName.match(/^(.+?)[-_](\d+)$/);
      const baseNamePart = numMatch ? `${numMatch[1]}-${numMatch[2]}` : hyphenName;
      
      // Simplify the filename generation by focusing on common patterns
      let filePattern;
      
      if (has2E1) {
        // Pattern with 2_e_1 suffix
        filePattern = `${genre}_${baseNamePart}_${baseNamePart}-partitura_2_e_1.musicxml`;
      } else if (has1E1) {
        // Pattern with 1_e_1 suffix (most common)
        filePattern = `${genre}_${baseNamePart}_${baseNamePart}-partitura_1_e_1.musicxml`;
      } else if (hasPartitura) {
        // Pattern with partitura but no e suffix
        filePattern = `${genre}_${baseNamePart}_${baseNamePart}-partitura.musicxml`;
      } else {
        // Simple pattern without special suffixes
        filePattern = `${genre}_${baseNamePart}.musicxml`;
      }
      
      // Set the filename
      fileName = filePattern;
    }
    
    // Create the result with primary path and alternatives
    const result = {
      isValid: true,
      fullPath: folderPath + fileName,
      fileName: fileName,
      tradition: tradition,
      genre: genre,
      possiblePaths: [] // We'll add more paths to try
    };
    
    // Add the primary path to the list of possible paths
    result.possiblePaths.push(result.fullPath);
    
    // Add alternative paths with various naming patterns
    if (tradition === 'irish') {
      // Generate Irish alternatives
      addIrishAlternativePaths(result, folderPath, genre, nodeName);
    } else if (tradition === 'galician') {
      // Generate Galician alternatives
      addGalicianAlternativePaths(result, folderPath, genre, nodeName);
    }
    
    // Add a generic wildcard lookup hint
    result.wildcardPath = `${folderPath}${genre}_*.musicxml`;
    
    // Remove duplicates from possible paths
    result.possiblePaths = [...new Set(result.possiblePaths)];
    
    // Fix any double-hyphens or other problematic patterns
    result.possiblePaths = result.possiblePaths.map(path => path.replace(/--+/g, '-'));
    
    console.log(`Generated primary path: ${result.fullPath}`);
    console.log(`Alternative paths (${result.possiblePaths.length}):`, result.possiblePaths);
    
    return result;
  } catch (err) {
    console.error("Error mapping score to file path:", err);
    return { isValid: false };
  }
}

// Helper function to add Irish alternative paths
function addIrishAlternativePaths(result, folderPath, genre, nodeName) {
  // Get clean base name
  const baseName = nodeName
    .replace(/\.krn$/, '')
    .replace(/\.musicxml$/, '')
    .replace(/\s+1\s+e\s+1$/i, '')
    .replace(/_1_1$/i, '')
    .replace(/_2_1$/i, '')
    .replace(/_\d+_\d+$/i, '')
    .trim();
  
  // Split into words
  const words = baseName.split(/\s+/);
  
  // PATTERN 1: Original camelcase with hyphens (most common)
  const camelCaseHyphen = words.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join('-');
  result.possiblePaths.push(folderPath + `${genre}_${camelCaseHyphen}.musicxml`);
  
  // PATTERN 2: Original camelcase with underscores
  const camelCaseUnderscore = words.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join('_');
  result.possiblePaths.push(folderPath + `${genre}_${camelCaseUnderscore}.musicxml`);
  
  // PATTERN 3: All lowercase with hyphens
  const lowerHyphen = words.join('-').toLowerCase();
  result.possiblePaths.push(folderPath + `${genre}_${lowerHyphen}.musicxml`);
  
  // PATTERN 4: All lowercase with underscores
  const lowerUnderscore = words.join('_').toLowerCase();
  result.possiblePaths.push(folderPath + `${genre}_${lowerUnderscore}.musicxml`);
  
  // PATTERN 5: Check for The in name - move to end
  if (words[0].toLowerCase() === 'the' && words.length > 1) {
    const nameWithoutThe = words.slice(1);
    const theAtEnd = nameWithoutThe.map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('-') + '--The';
    result.possiblePaths.push(folderPath + `${genre}_${theAtEnd}.musicxml`);
  }
  
  // PATTERN 6: Try with "The" at beginning for names ending with "The"
  if (words[words.length-1].toLowerCase() === 'the' && words.length > 1) {
    const nameWithoutEndThe = words.slice(0, -1);
    const theAtStart = 'The-' + nameWithoutEndThe.map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('-');
    result.possiblePaths.push(folderPath + `${genre}_${theAtStart}.musicxml`);
  }
  
  // PATTERN 7: Try with numeric patterns
  result.possiblePaths.push(folderPath + `${genre}_${lowerHyphen}_1_1.musicxml`);
  result.possiblePaths.push(folderPath + `${genre}_${camelCaseHyphen}_1_1.musicxml`);
  
  // PATTERN 8: Legacy dataset path
  result.possiblePaths.push(`preprocessed_data/folksheetmusic/musicxml_irl_dataset/${genre}_${camelCaseHyphen}.musicxml`);
  result.possiblePaths.push(`preprocessed_data/folksheetmusic/musicxml_irl_dataset/${genre}_${lowerHyphen}.musicxml`);
  
  // Add some special cases based on observed patterns
  if (genre === 'strathspey') {
    // Some strathspey files have unique capitalization
    const specialCase = words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('-');
    result.possiblePaths.push(folderPath + `strathspey_${specialCase}.musicxml`);
    
    // Check for "Is It A Jig Yet" pattern
    if (baseName.toLowerCase().includes('is it a jig')) {
      result.possiblePaths.push(folderPath + "strathspey_Is-It-A-Jig-Yet.musicxml");
    }
    
    // Check for "Reel Of Tulloch" pattern
    if (baseName.toLowerCase().includes('tulloch')) {
      result.possiblePaths.push(folderPath + "strathspey_Reel-Of-Tulloch--The.musicxml");
    }
  }
  
  if (genre === 'polka') {
    // Check for polka with accent marks
    if (baseName.toLowerCase().includes('bainne')) {
      result.possiblePaths.push(folderPath + "polka_Polca-Na-Carraige-Báinne.musicxml");
    }
  }
  
  // Special case for Kinclaven Brig
  if (baseName.toLowerCase().includes('kinclaven')) {
    result.possiblePaths.push(folderPath + "barndance_Kinclaven-Brig.musicxml");
  }
}

// Streamlined helper function for Galician alternative paths
function addGalicianAlternativePaths(result, folderPath, genre, nodeName) {
  // Clean the base name
  const baseName = nodeName
    .replace(/\.(krn|musicxml)$/i, '')
    .trim();
  
  // Convert to lowercase and replace spaces with hyphens
  const hyphenName = baseName.toLowerCase().replace(/\s+/g, '-');
  
  // Detect patterns
  const hasPartitura = baseName.toLowerCase().includes('partitura');
  const has1E1 = baseName.toLowerCase().includes('1 e 1') || baseName.includes('_1_e_1');
  const has2E1 = baseName.toLowerCase().includes('2 e 1') || baseName.includes('_2_e_1');
  
  // Check for numeric pattern in name (like alala-10, valse-6)
  const numMatch = hyphenName.match(/^(.+?)[-_](\d+)$/);
  const baseNamePart = numMatch ? `${numMatch[1]}-${numMatch[2]}` : hyphenName;
  const numericPart = numMatch ? numMatch[2] : '';
  
  // Add alternative path patterns in order of likelihood
  
  // 1. Basic pattern variations with duplicated name
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}_${baseNamePart}-partitura_1_e_1.musicxml`);
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}_${baseNamePart}-partitura_2_e_1.musicxml`);
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}_${baseNamePart}-partitura.musicxml`);
  
  // 2. Variations with just the base name
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}.musicxml`);
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}-partitura.musicxml`);
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}-partitura_1_e_1.musicxml`);
  result.possiblePaths.push(folderPath + `${genre}_${baseNamePart}-partitura_2_e_1.musicxml`);
  
  // 3. Special cases for numbered items in specific genres
  if (numericPart && genre === 'alalas') {
    result.possiblePaths.push(folderPath + `${genre}_alala-${numericPart}_alala-partitura_1_e_1.musicxml`);
    result.possiblePaths.push(folderPath + `${genre}_alala-${numericPart}-alala-partitura-1-e-1_alala-${numericPart}-alala-partitura-1-e-1-partitura_1_e_1.musicxml`);
  }
  
  if (numericPart && genre === 'valses') {
    result.possiblePaths.push(folderPath + `${genre}_valse-${numericPart}_valse-partitura_1_e_1.musicxml`);
    result.possiblePaths.push(folderPath + `${genre}_valse-${numericPart}_valse-partitura_2_e_1.musicxml`);
  }
  
  if (numericPart && (genre === 'mazurcas' || genre === 'muineiras' || genre === 'polca' || genre === 'pasacorredoiras')) {
    result.possiblePaths.push(folderPath + `${genre}_${genre.replace(/s$/, '')}-${numericPart}_${genre.replace(/s$/, '')}-partitura_1_e_1.musicxml`);
    result.possiblePaths.push(folderPath + `${genre}_${genre.replace(/s$/, '')}-${numericPart}_${genre.replace(/s$/, '')}-partitura_2_e_1.musicxml`);
  }
  
  // 4. Legacy dataset path
  result.possiblePaths.push(`preprocessed_data/folksheetmusic/musicxml_gal_dataset/${genre}_${hyphenName}.musicxml`);
}

// Updated search directory function with improved pattern matching
async function searchDirectoryForMatchingFile(tradition, genre, nodeName) {
  // Determine which directory to search based on new structure
  const dirPath = tradition === 'irish'
    ? `preprocessed_data/folksheetmusic/irish/${genre}/` 
    : `preprocessed_data/folksheetmusic/galician/${genre}/`;
  
  try {
    console.log(`Searching directory: ${dirPath} for files matching: ${nodeName}`);
    
    // Try to access the directory
    const dirResponse = await fetch(dirPath);
    if (!dirResponse.ok) {
      console.log(`❌ Cannot access directory: ${dirPath}`);
      return null;
    }
    
    // Get directory contents
    const html = await dirResponse.text();
    
    // Extract links to MusicXML files
    const musicXmlLinks = [];
    const regex = /<a href="([^"]+\.musicxml)">/g;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
      musicXmlLinks.push(match[1]);
    }
    
    if (musicXmlLinks.length === 0) {
      console.log('No MusicXML files found in directory');
      return null;
    }
    
    console.log(`Found ${musicXmlLinks.length} MusicXML files in directory`);
    
    // Clean up node name for matching - with more pattern handling
    let cleanNodeName = nodeName
      .replace(/\.krn$/, '')
      .toLowerCase()
      .replace(/\s+1\s+e\s+1$/i, '')    // Remove "1 E 1" suffix
      .replace(/_1_1$/i, '')            // Remove "_1_1" suffix
      .replace(/_2_1$/i, '')            // Remove "_2_1" suffix
      .replace(/_\d+_\d+$/i, '')        // Remove any "_X_Y" pattern
      .trim();
    
    // Try to find the best match based on node name
    let bestMatch = null;
    let bestMatchScore = 0;
    
    for (const link of musicXmlLinks) {
      // Extract filename without extension for comparison
      const filename = link.replace(/\.musicxml$/, '');
      
      // Check if file has genre prefix - remove it for matching if present
      let comparableName = filename;
      if (filename.startsWith(`${genre}_`)) {
        comparableName = filename.substring(genre.length + 1);
      }
      
      // Convert to comparable format based on tradition
      comparableName = tradition === 'irish'
        ? comparableName.replace(/_/g, ' ')
        : comparableName.replace(/-/g, ' ');
      
      // Also remove numeric patterns from the file for comparison
      comparableName = comparableName
        .replace(/_1_1$/i, '')
        .replace(/_2_1$/i, '')
        .replace(/_\d+_\d+$/i, '');
      
      // Calculate similarity score with enhanced matching
      const nodeWords = cleanNodeName.split(/\s+/);
      const fileWords = comparableName.split(/\s+/);
      
      let matchScore = 0;
      
      // Award more points for prefix matches (beginning of the name)
      for (let i = 0; i < nodeWords.length; i++) {
        const nodeWord = nodeWords[i];
        if (nodeWord.length < 2) continue; // Skip very short words
        
        for (let j = 0; j < fileWords.length; j++) {
          const fileWord = fileWords[j];
          if (fileWord.length < 2) continue;
          
          // Exact word match gets highest score
          if (fileWord === nodeWord) {
            matchScore += 2;
            // Early words matching gets bonus
            if (i === 0 && j === 0) matchScore += 3;
            else if (i < 2 && j < 2) matchScore += 1;
          }
          // Partial match (one word contains the other)
          else if (fileWord.includes(nodeWord) || nodeWord.includes(fileWord)) {
            matchScore += 1;
            // Early words partial matching gets bonus
            if (i === 0 && j === 0) matchScore += 1;
          }
          // Stem match (handles plurals, etc)
          else if (fileWord.length > 3 && nodeWord.length > 3 && 
                  (fileWord.includes(nodeWord.substring(0, nodeWord.length-1)) || 
                   nodeWord.includes(fileWord.substring(0, fileWord.length-1)))) {
            matchScore += 0.5;
          }
        }
      }
      
      // Update best match if this one is better
      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        bestMatch = link;
      }
    }
    
    // If we found a decent match, return it
    if (bestMatch && bestMatchScore > 0) {
      console.log(`Found best match with score ${bestMatchScore}: ${bestMatch}`);
      return `${dirPath}${bestMatch}`;
    }
    
    // If no good match, just return the first file in the directory
    console.log(`No good match found, using first file: ${musicXmlLinks[0]}`);
    return `${dirPath}${musicXmlLinks[0]}`;
    
  } catch (err) {
    console.error(`Error searching directory: ${err}`);
    return null;
  }
}

// Enhanced debug function to show more information about file paths with new structure
async function debugScoreLoading(scoreNode) {
  console.group('🔍 Score Loading Debug');
  console.log('Score node:', scoreNode);

  // Get the file path mapping
  const scoreInfo = mapScoreToFilePath(scoreNode);
  console.log('Mapped path info:', scoreInfo);

  // Test direct access to primary path
  try {
    const testResponse = await fetch(scoreInfo.fullPath, { method: 'HEAD' });
    console.log(`Primary path exists: ${testResponse.ok ? '✅ Found' : '❌ Not found'} (${testResponse.status})`);
    
    if (testResponse.ok) {
      try {
        // Check if the file actually contains MusicXML content
        const contentResponse = await fetch(scoreInfo.fullPath);
        const contentText = await contentResponse.text();
        const isMusicXML = contentText.includes('<?xml') && 
                           (contentText.includes('<score-partwise') || 
                            contentText.includes('<opus') || 
                            contentText.includes('<music-score'));
        
        console.log(`Primary path content check: ${isMusicXML ? '✅ Valid MusicXML' : '❌ Not valid MusicXML'}`);
      } catch (e) {
        console.log('Content check error:', e.message);
      }
    }
  } catch (err) {
    console.log('Primary path check error:', err.message);
  }

  // Test direct access to alternative paths
  if (scoreInfo.possiblePaths && scoreInfo.possiblePaths.length > 0) {
    console.log(`Testing ${scoreInfo.possiblePaths.length} alternative paths:`);
    
    for (const path of scoreInfo.possiblePaths) {
      try {
        const altResponse = await fetch(path, { method: 'HEAD' });
        console.log(`- ${path}: ${altResponse.ok ? '✅ Found' : '❌ Not found'} (${altResponse.status})`);
      } catch (err) {
        console.log(`- ${path}: ❌ Error: ${err.message}`);
      }
    }
  }

  // Check if we can access and list the directory (using genre folder path)
  const dirPath = scoreInfo.fullPath.substring(0, scoreInfo.fullPath.lastIndexOf('/') + 1);
  console.log('Attempting to list directory:', dirPath);
  
  try {
    const dirResponse = await fetch(dirPath);
    if (dirResponse.ok) {
      const html = await dirResponse.text();
      if (html.includes('<a href')) {
        // Extract MusicXML files
        const xmlFiles = [];
        const regex = /<a href="([^"]+\.musicxml)">/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
          xmlFiles.push(match[1]);
        }
        
        console.log(`Found ${xmlFiles.length} MusicXML files in directory`);
        
        // Look for any files that might match the score name
        const scoreName = scoreNode.name.toLowerCase().replace(/\.krn$/, '');
        const nameMatches = xmlFiles.filter(file => {
          const lowerFile = file.toLowerCase();
          return scoreName.split(' ').some(part => 
            part.length > 3 && lowerFile.includes(part.toLowerCase())
          );
        });
        
        if (nameMatches.length > 0) {
          console.log('Files potentially matching score name:', nameMatches);
        }
        
        // List all files for reference
        if (xmlFiles.length <= 20) {
          console.log('All MusicXML files in directory:', xmlFiles);
        } else {
          console.log('First 20 MusicXML files in directory:', xmlFiles.slice(0, 20));
        }
      } else {
        console.log('Directory listing not available (no links found)');
      }
    } else {
      console.log(`Directory not accessible: ${dirResponse.status}`);
    }
  } catch (err) {
    console.log('Directory listing error:', err.message);
  }

  console.groupEnd();
}

// Enhanced loadScoreContent function with improved path fallback mechanism
async function loadScoreContent(filePath) {
  try {
    let content = null;
    let successPath = null;
    
    // Try to get the current score for more path options
    const currentScoreInfo = currentScore.value ? mapScoreToFilePath(currentScore.value) : null;
    const possiblePaths = currentScoreInfo?.possiblePaths || [filePath];
    
    console.log(`Attempting to load score from ${possiblePaths.length} possible paths`);
    
    // Try each path in sequence
    for (const path of possiblePaths) {
      if (content) break; // Stop if we already found content
      
      try {
        console.log(`Trying: ${path}`);
        const response = await fetch(path);
        
        if (response.ok) {
          const text = await response.text();
          
          // Validate that this is actually MusicXML content
          if (text.includes('<?xml') && 
             (text.includes('<score-partwise') || 
              text.includes('<opus') || 
              text.includes('<music-score'))) {
            console.log(`✅ Successfully loaded valid MusicXML from: ${path}`);
            content = text;
            successPath = path;
            break;
          } else {
            console.log(`❌ Path returned content, but it is not valid MusicXML: ${path}`);
          }
        } else {
          console.log(`❌ Path failed (${response.status}): ${path}`);
        }
      } catch (err) {
        console.log(`❌ Error with path ${path}: ${err.message}`);
      }
    }
    
    // If we couldn't find the file through direct paths, try directory listing
    if (!content && currentScore.value) {
      console.log("Direct paths failed, trying directory listing fallback");
      
      const tradition = currentScore.value.tradition || currentTradition.value;
      const genre = currentScore.value.genre || currentGenre.value;
      
      if (tradition && genre) {
        try {
          const wildcardMatch = await searchDirectoryForMatchingFile(
            tradition, 
            genre, 
            currentScore.value.name
          );
          
          if (wildcardMatch) {
            console.log(`✅ Found file through directory search: ${wildcardMatch}`);
            
            // Try to load the content
            const wildcardResponse = await fetch(wildcardMatch);
            if (wildcardResponse.ok) {
              const text = await wildcardResponse.text();
              
              // Validate XML content
              if (text.includes('<?xml') && 
                 (text.includes('<score-partwise') || 
                  text.includes('<opus') || 
                  text.includes('<music-score'))) {
                console.log(`✅ Successfully loaded valid MusicXML from wildcard match`);
                content = text;
                successPath = wildcardMatch;
              }
            }
          }
        } catch (err) {
          console.log(`❌ Error with directory search: ${err.message}`);
        }
      }
    }
    
    // If we found content, return it
    if (content) {
      console.log(`Successfully loaded valid MusicXML score (${content.length} bytes) from: ${successPath}`);
      return content;
    }
    
    // If we reach here, try one last approach - look for ANY musicxml file in the genre folder
    if (currentScore.value) {
      const tradition = currentScore.value.tradition || currentTradition.value;
      const genre = currentScore.value.genre || currentGenre.value;
      
      if (tradition && genre) {
        const genrePath = `preprocessed_data/folksheetmusic/${tradition}/${genre}/`;
        
        try {
          console.log(`Last resort: trying to find ANY MusicXML file in ${genrePath}`);
          const dirResponse = await fetch(genrePath);
          
          if (dirResponse.ok) {
            const html = await dirResponse.text();
            
            // Extract the first .musicxml file
            const regex = /<a href="([^"]+\.musicxml)">/;
            const match = regex.exec(html);
            
            if (match && match[1]) {
              const firstFile = `${genrePath}${match[1]}`;
              console.log(`Found a MusicXML file as last resort: ${firstFile}`);
              
              const fileResponse = await fetch(firstFile);
              if (fileResponse.ok) {
                const text = await fileResponse.text();
                
                // Validate XML content
                if (text.includes('<?xml') && 
                   (text.includes('<score-partwise') || 
                    text.includes('<opus') || 
                    text.includes('<music-score'))) {
                  console.log(`✅ Successfully loaded valid MusicXML from last resort file`);
                  content = text;
                  successPath = firstFile;
                  return content;
                }
              }
            }
          }
        } catch (err) {
          console.log(`❌ Error with last resort approach: ${err.message}`);
        }
      }
    }
    
    // If we reach here, no paths worked
    throw new Error(`Failed to load score from ${filePath} or any alternatives. Please check that MusicXML files exist in the expected locations.`);
  } catch (err) {
    console.error("Error loading score:", err);
    throw err;
  }
}

// Fix for the "Score container not found" error
function renderScore(content) {
  try {
    // Get the container element - add extra validation
    const container = scoreRenderer.value;
    
    // Debug logging to see what's happening
    console.log("Score renderer element:", container);
    
    if (!container) {
      console.error("Score container not found - waiting for it to be available");
      
      // Try again after a short delay to allow the DOM to update
      setTimeout(() => {
        const retryContainer = scoreRenderer.value;
        if (retryContainer) {
          console.log("Score container found on retry");
          renderScore(content); // Try again with the same content
        } else {
          console.error("Score container still not found after retry");
          // Create a fallback container if needed
          const fallbackContainer = document.querySelector('.score-content') || 
                                   document.querySelector('.score-view-container');
          
          if (fallbackContainer) {
            console.log("Using fallback container");
            renderWithOSMD(content, fallbackContainer);
          }
        }
      }, 100);
      return;
    }
    
    // Clear any previous content
    container.innerHTML = '';
    
    // First check if this is valid MusicXML content
    const isValidMusicXML = 
      (content.includes('<?xml') && 
       (content.includes('<score-partwise') || 
        content.includes('<opus') || 
        content.includes('<music-score') ||
        content.includes('<MusicXML'))) || // Add more potential MusicXML formats
      content.includes('<!DOCTYPE score-partwise'); // Some files use DOCTYPE instead of XML declaration
    
    if (!isValidMusicXML) {
      console.error("Content doesn't appear to be valid MusicXML");
      
      container.innerHTML = `
        <div class="score-error">
          <h3>Invalid MusicXML Format</h3>
          <p>The file was found, but doesn't appear to be a valid MusicXML document.</p>
          <div class="file-info">
            <p><strong>File path:</strong> ${scoreFilePath.value}</p>
            <p><strong>Content preview:</strong></p>
            <pre class="xml-preview">${content.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;')}...</pre>
          </div>
          <p>Please try a different score or check the file format.</p>
          <button id="retry-load" class="retry-button">
            Retry With OpenSheetMusicDisplay
          </button>
        </div>
      `;
      
      // Add event listener for the back button
      const backBtn = document.getElementById('back-to-list');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          navigateToBreadcrumb(breadcrumbs.value[breadcrumbs.value.length - 2] || breadcrumbs.value[0]);
        });
      }
      
      // Add a retry button that will try to render anyway
      const retryBtn = document.getElementById('retry-load');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          // Force render attempt even if validation failed
          renderWithOSMD(content, container);
        });
      }
      
      return;
    }
    
    // If we passed validation, render normally
    renderWithOSMD(content, container);
  } catch (err) {
    console.error("Error in renderScore function:", err);
    
    // Use a more robust way to get the container
    const container = scoreRenderer.value || 
                      document.querySelector('.score-content') || 
                      document.querySelector('.score-view-container');
    
    if (container) {
      container.innerHTML = `
        <div class="score-error">
          <h3>Unexpected Error</h3>
          <p>An error occurred while trying to render the score: ${err.message}</p>
          <button id="retry-load" class="retry-button">
            Retry With OpenSheetMusicDisplay
          </button>
        </div>
      `;
      
      const backBtn = document.getElementById('back-to-list');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          navigateToBreadcrumb(breadcrumbs.value[breadcrumbs.value.length - 2] || breadcrumbs.value[0]);
        });
      }
      
      const retryBtn = document.getElementById('retry-load');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          // Force render attempt even if there was an error
          renderWithOSMD(content, container);
        });
      }
    }
  }
}

// Use this function in your loadScoreContent and renderScore functions

// Add this function to extract text using regex patterns
function extractTextWithRegex(content, pattern) {
  if (!content) return '';
  const match = content.match(pattern);
  return match && match[1] ? match[1] : '';
}

// Modified renderWithOSMD function to make the single score view more minimal
function renderWithOSMD(content, container) {
  // Create loading indicator
  container.innerHTML = `
    <div class="score-loading">
      <div class="loading-spinner"></div>
      <p>Loading score...</p>
    </div>
  `;
  
  // Dynamically import OpenSheetMusicDisplay
  import('opensheetmusicdisplay').then(async OSMD => {
    try {
      // Clear the loading indicator
      container.innerHTML = '';
      
      // Create the score view structure
      const scoreView = document.createElement('div');
      scoreView.className = 'score-view minimal-view';
      
      // Create the OSMD container directly
      const osmdContainer = document.createElement('div');
      osmdContainer.className = 'osmd-container';
      scoreView.appendChild(osmdContainer);
      
      // Add the score view to the container
      container.appendChild(scoreView);
      
      // Initialize OpenSheetMusicDisplay with options to show the title within the score
      const osmd = new OSMD.OpenSheetMusicDisplay(osmdContainer, {
        autoResize: false, // Don't auto-resize
        drawTitle: true,
        drawSubtitle: false, // Don't draw subtitle to save space
        drawComposer: false, // Don't draw composer to save space
        drawCredits: false, // Don't draw credits to save space
        disableCursor: true, // Disable cursor to save resources
        
        // Enhanced drawing parameters for horizontal condensing
        drawingParameters: {
          defaultStaffHeight: 10, 
          compactMode: true,
          noteSpacingFactor: 0.7, 
          measureMinimumWidth: 10,
          staffDistance: 10,
          systemDistance: 8,
          pageTopMargin: 10,
          pageBottomMargin: 10,
          pageLeftMargin: 10,
          pageRightMargin: 10,
          compactModeMinimumWidth: 8,
          renderSingleHorizontalStaffline: true,
          useXMLMeasureWidth: false, 
          defaultColorNote: "#000000",
          defaultFontFamily: "Arial",
          defaultFontStyle: "normal"
        },
        
        pageWidth: 1000,
        stretchLastSystemLine: false,
        newSystemFromXML: true
      });
      
      // Log the content for debugging
      console.log("Creating OSMD instance with content length:", content.length);
      
      // Load and render the score
      try {
        await osmd.load(content);
        await osmd.render();
        console.log('Score rendered successfully with OpenSheetMusicDisplay');
        
        // Add download button at the BOTTOM
        const bottomControlContainer = document.createElement('div');
        bottomControlContainer.className = 'bottom-control-container';
        
        const downloadButton = document.createElement('button');
        downloadButton.className = 'download-button';
        downloadButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="margin-right: 5px;">
            <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          Download MusicXML
        `;
        downloadButton.addEventListener('click', () => {
          const blob = new Blob([content], {type: 'text/xml'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `score.musicxml`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
        
        bottomControlContainer.appendChild(downloadButton);
        
        // Add it after the OSMD container
        scoreView.appendChild(bottomControlContainer);
        
      } catch (loadErr) {
        console.error('Error during OSMD load/render:', loadErr);
        
        // Try XML parsing workaround
        try {
          console.log("Trying XML parser workaround...");
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, "text/xml");
          
          // Convert back to string (fixes some malformed XML issues)
          const serializer = new XMLSerializer();
          const cleanedXml = serializer.serializeToString(xmlDoc);
          
          // Try loading again with cleaned XML
          await osmd.load(cleanedXml);
          await osmd.render();
          console.log('Score rendered successfully with XML cleanup workaround');
          
          // Add download button at the BOTTOM
          const bottomControlContainer = document.createElement('div');
          bottomControlContainer.className = 'bottom-control-container';
          
          const downloadButton = document.createElement('button');
          downloadButton.className = 'download-button';
          downloadButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="margin-right: 5px;">
              <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download MusicXML
          `;
          downloadButton.addEventListener('click', () => {
            const blob = new Blob([cleanedXml], {type: 'text/xml'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `score.musicxml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
          
          bottomControlContainer.appendChild(downloadButton);
          
          // Add it after the OSMD container
          scoreView.appendChild(bottomControlContainer);
          
        } catch (xmlErr) {
          // If both attempts fail, display error
          osmdContainer.innerHTML = `
            <div class="score-error">
              <h3>Error Rendering Score</h3>
              <p>${loadErr.message}</p>
              <p>This might be due to unsupported features or invalid MusicXML format.</p>
              <p><strong>Raw MusicXML content preview:</strong></p>
              <pre class="xml-preview">${content.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;')}...</pre>
            </div>
          `;
        }
      }
    } catch (osmdError) {
      console.error('Error rendering with OpenSheetMusicDisplay:', osmdError);
      
      // Show error message
      container.innerHTML = `
        <div class="score-error">
          <h3>Error Rendering Score</h3>
          <p>${osmdError.message}</p>
        </div>
      `;
    }
  }).catch(importError => {
    console.error('Error importing OpenSheetMusicDisplay:', importError);
    
    // Show error if the library failed to load
    container.innerHTML = `
      <div class="score-error">
        <h3>Error Loading Score Renderer</h3>
        <p>${importError.message}</p>
        <p>Could not load the OpenSheetMusicDisplay library.</p>
      </div>
    `;
  });
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

// Compare Section

// Function to enable compare mode
function enableCompareMode() {
  compareMode.value = true;
  selectedScores.value = [];
  
  // Update tree visualization to show all nodes as semi-transparent
  if (treeContainer.value) {
    d3.select(treeContainer.value).selectAll('.node circle')
      .transition()
      .duration(300)
      .attr('opacity', 0.4);
      
    d3.select(treeContainer.value).selectAll('.node-label')
      .transition()
      .duration(300)
      .attr('opacity', 0.4);
      
    d3.select(treeContainer.value).selectAll('.link')
      .transition()
      .duration(300)
      .attr('opacity', 0.2);
  }
  
  // Update node click handler for score selection
  d3.select(treeContainer.value).selectAll('.node')
    .on('click', handleCompareNodeClick);
}

// Function to cancel compare mode
function cancelCompareMode() {
  compareMode.value = false;
  selectedScores.value = [];
  
  // Reset tree visualization
  if (treeContainer.value) {
    d3.select(treeContainer.value).selectAll('.node circle')
      .transition()
      .duration(300)
      .attr('opacity', 1);
      
    d3.select(treeContainer.value).selectAll('.node-label')
      .transition()
      .duration(300)
      .attr('opacity', 1);
      
    d3.select(treeContainer.value).selectAll('.link')
      .transition()
      .duration(300)
      .attr('opacity', 0.8);
  }
  
  // Restore original click handler
  d3.select(treeContainer.value).selectAll('.node')
    .on('click', handleNodeClick);
}

// Handle node click in compare mode
function handleCompareNodeClick(event, d) {
  event.stopPropagation();
  
  // Only allow selecting score nodes (leaf nodes)
  if (d.children) {
    return; // Not a score node, ignore click
  }
  
  const scoreNode = d.data;
  
  // Check if the node is already selected
  const scoreIndex = selectedScores.value.findIndex(s => 
    s.name === scoreNode.name && s.genre === scoreNode.genre
  );
  
  if (scoreIndex >= 0) {
    // Score is already selected, deselect it
    selectedScores.value.splice(scoreIndex, 1);
    
    // Update visual state to unselected
    d3.select(event.currentTarget)
      .classed('selected', false)
      .select('circle')
      .transition()
      .duration(300)
      .attr('opacity', 0.4)
      .attr('stroke-width', 1)
      .attr('r', 5)
      .attr('fill', d => d.data.color || '#999');
  } else {
    // Only allow selecting up to maxCompareScores
    if (selectedScores.value.length >= maxCompareScores) {
      alert(`You can only compare up to ${maxCompareScores} scores at once.`);
      return;
    }
    
    // Add to selected scores
    selectedScores.value.push(scoreNode);
    
    // Update visual state to selected
    d3.select(event.currentTarget)
      .classed('selected', true)
      .select('circle')
      .transition()
      .duration(300)
      .attr('opacity', 1)
      .attr('stroke-width', 3)
      .attr('r', 8)
      .attr('stroke', '#ff5733')
      .attr('fill', '#ff5733'); // Solid fill color
      
    // Make the text more visible
    d3.select(event.currentTarget).select('text')
      .transition()
      .duration(300)
      .attr('opacity', 1)
      .attr('font-weight', 'bold');
  }
  
  console.log(`Selected scores (${selectedScores.value.length}):`, selectedScores.value);
}

// Completely rewritten viewSelectedScores function with sequential loading and better error handling
async function viewSelectedScores() {
  if (selectedScores.value.length === 0) {
    alert("Please select at least one score to compare.");
    return;
  }
  
  try {
    // Change to compare view and set loading state
    currentView.value = 'compare';
    scoreLoading.value = true;
    scoreError.value = null;
    
    // Reset comparison data arrays
    comparisonScoreData.value = Array(selectedScores.value.length).fill(null);
    comparisonRenderers.value = [];
    
    // Wait for Vue to update the DOM before accessing renderer elements
    await nextTick();
    
    // Wait a bit longer to ensure DOM is fully rendered
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log("Starting comparison score loading process");
    
    // Process scores sequentially - THIS IS CRITICAL TO PREVENT BROWSER CRASH
    for (let index = 0; index < selectedScores.value.length; index++) {
      try {
        const score = selectedScores.value[index];
        console.log(`Loading score ${index + 1}/${selectedScores.value.length}: ${score.name}`);
        
        // Get the renderer element
        const rendererEl = document.getElementById(`comparison-renderer-${index}`);
        
        if (!rendererEl) {
          console.error(`No container found for score ${index + 1}`);
          continue;
        }
        
        comparisonRenderers.value.push(rendererEl);
        
        // Set loading indicator
        rendererEl.innerHTML = `
          <div class="score-loading">
            <div class="loading-spinner"></div>
            <p>Loading ${score.name}...</p>
          </div>
        `;
        
        // Wait for the DOM to update with the loading indicator
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // IMPORTANT: Treat the score as if it were the current score to get proper paths
        currentScore.value = score;
        
        // Use the existing mapScoreToFilePath function to get all possible paths
        const scoreInfo = mapScoreToFilePath(score);
        
        if (!scoreInfo.isValid) {
          throw new Error(`Could not determine score file path for ${score.name}`);
        }
        
        console.log(`Attempting to load score from: ${scoreInfo.fullPath}`);
        
        // Use the loadScoreContent function that works for individual scores
        let content = null;
        try {
          content = await loadScoreContent(scoreInfo.fullPath);
          
          if (!content) {
            throw new Error(`No valid content found for ${score.name}`);
          }
          
          // Store the content
          comparisonScoreData.value[index] = content;
          
          // Create OSMD container
          rendererEl.innerHTML = '';
          const osmdContainer = document.createElement('div');
          osmdContainer.className = 'osmd-comparison-container';
          rendererEl.appendChild(osmdContainer);
          
          // Render with OSMD with optimized settings for comparison view
          const OSMD = await import('opensheetmusicdisplay');
          const osmd = new OSMD.OpenSheetMusicDisplay(osmdContainer, {
            autoResize: false, // Important: disable auto-resize for comparison view
            drawTitle: true,
            drawSubtitle: false, // Simplify what's shown
            drawComposer: false,
            drawCredits: false,
            disableCursor: true, // Disable cursor to save resources
            // Zoom out to fit more of the score
            drawingParameters: {
              defaultFontFamily: "Arial",
              defaultFontStyle: "normal",
              defaultStaffHeight: 10, // Smaller staff height to fit more
              defaultColorNote: "#000000",
              compactMode: true, // Enable compact mode
              renderSingleHorizontalStaffline: true,
              optimizeForPrint: true // Better rendering for viewing 
            },
            // More optimization settings
            pageBackgroundColor: "#FFFFFF",
            drawHiddenNotes: false, // Less overhead
            newSystemFromXML: false,
            stretchLastSystemLine: false
          });
          
          // Load and render
          await osmd.load(content);
          osmd.zoom = 0.6; // Start more zoomed out
          await osmd.render();
          console.log(`Successfully rendered score ${index + 1}`);
          
          // Apply initial zoom to fit more of the score
          osmd.zoom = 0.6; // Start more zoomed out
          
          await osmd.render();
          console.log(`Successfully rendered score ${index + 1}`);
          
          // Add zoom controls
          const zoomControls = document.createElement('div');
          zoomControls.className = 'zoom-controls';
          zoomControls.innerHTML = `
            <button class="zoom-in">+</button>
            <button class="zoom-out">-</button>
            <button class="zoom-fit">Fit</button>
          `;
          rendererEl.insertBefore(zoomControls, osmdContainer);
          
          // Add event listeners to zoom controls
          const zoomIn = zoomControls.querySelector('.zoom-in');
          const zoomOut = zoomControls.querySelector('.zoom-out');
          const zoomFit = zoomControls.querySelector('.zoom-fit');
          
          zoomIn.addEventListener('click', () => {
            osmd.zoom = Math.min(osmd.zoom * 1.2, 2.0);
            osmd.render();
          });
          
          zoomOut.addEventListener('click', () => {
            osmd.zoom = Math.max(osmd.zoom * 0.8, 0.3);
            osmd.render();
          });
          
          zoomFit.addEventListener('click', () => {
            osmd.zoom = 0.6;
            osmd.render();
          });
          
        } catch (renderErr) {
          console.error(`Error rendering score ${index + 1}:`, renderErr);
          
          rendererEl.innerHTML = `
            <div class="score-error">
              <h3>Error Loading Score</h3>
              <p>${renderErr.message}</p>
              <p>Please check that MusicXML files exist at the expected locations.</p>
            </div>
          `;
        }
        
        // IMPORTANT: Wait between scores to prevent overwhelming the browser
        // This delay is crucial for preventing crashes
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add download button at the BOTTOM of each comparison renderer
        const bottomControlContainer = document.createElement('div');
        bottomControlContainer.className = 'comparison-bottom-control-container';
        
        const downloadButton = document.createElement('button');
        downloadButton.className = 'download-button';
        downloadButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="margin-right: 5px;">
            <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          Download MusicXML
        `;
        downloadButton.addEventListener('click', () => {
          const blob = new Blob([content], {type: 'text/xml'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // Use score name for the filename if available
          const scoreName = score.name || `score-${index + 1}`;
          // Clean the filename by replacing spaces with dashes and removing special characters
          const cleanFilename = scoreName.replace(/[^a-zA-Z0-9_-]/g, '-');
          a.download = `${cleanFilename}.musicxml`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
        
        bottomControlContainer.appendChild(downloadButton);
        rendererEl.appendChild(bottomControlContainer);
        
      } catch (err) {
        console.error(`Error loading score ${index}:`, err);
        
        // Create error display
        const rendererEl = document.getElementById(`comparison-renderer-${index}`);
        if (rendererEl) {
          rendererEl.innerHTML = `
            <div class="score-error">
              <h3>Error Loading Score</h3>
              <p>${err.message}</p>
            </div>
          `;
        }
        
        // Add a small delay before continuing to the next score
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Restore the original current score
    currentScore.value = null;
    
    // Complete loading
    scoreLoading.value = false;
    
  } catch (err) {
    console.error("Error viewing selected scores:", err);
    scoreError.value = `Error comparing scores: ${err.message}`;
    scoreLoading.value = false;
  }
}

// Updated exitCompareView function with proper state restoration
function exitCompareView() {
  try {
    // Get the previous genre view from breadcrumbs
    const genreBreadcrumb = breadcrumbs.value.find(crumb => crumb.view === 'genre');
    
    if (genreBreadcrumb && genreBreadcrumb.tradition && genreBreadcrumb.genre) {
      // First update state variables to ensure correct navigation
      currentView.value = 'genre';
      currentTradition.value = genreBreadcrumb.tradition;
      currentGenre.value = genreBreadcrumb.genre;
      
      // Clear comparison-specific state
      selectedScores.value = [];
      comparisonRenderers.value = [];
      comparisonScoreData.value = [];
      compareMode.value = false;
      
      // Wait for Vue to update the DOM
      nextTick(() => {
        console.log('Returning to genre view:', genreBreadcrumb.genre);
        
        // Reload the genre tree data
        loadGenrePhylogeneticTree(
          genreBreadcrumb.genre,
          genreBreadcrumb.tradition,
          featureType.value,
          levelType.value
        );
      });
    } else {
      // If no genre breadcrumb exists, go back to tradition view
      const traditionBreadcrumb = breadcrumbs.value.find(crumb => crumb.view === 'tradition');
      
      if (traditionBreadcrumb && traditionBreadcrumb.tradition) {
        currentView.value = 'tradition';
        currentGenre.value = null;
        currentTradition.value = traditionBreadcrumb.tradition;
        selectedScores.value = [];
        comparisonRenderers.value = [];
        comparisonScoreData.value = [];
        compareMode.value = false;
        
        nextTick(() => {
          console.log('Returning to tradition view:', traditionBreadcrumb.tradition);
          loadSpecialTree(traditionBreadcrumb.tradition);
        });
      } else {
        // Last resort: go back to traditions overview
        currentView.value = 'traditions';
        currentGenre.value = null;
        currentTradition.value = null;
        selectedScores.value = [];
        comparisonRenderers.value = [];
        comparisonScoreData.value = [];
        compareMode.value = false;
        
        nextTick(() => {
          console.log('Returning to traditions overview');
          loadTreeData();
        });
      }
    }
  } catch (err) {
    console.error('Error in exitCompareView:', err);
    
    // Emergency fallback - at least get back to a valid view
    currentView.value = 'traditions';
    loadTreeData();
  }
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

// Updated navigateToGenre function with proper breadcrumb updates
function navigateToGenre(genre) {
  console.log(`navigateToGenre called with genre: ${genre}`);
  debugGenreNavigation(genre, currentTradition.value);
  
  // Update state immediately and consistently
  selectedNode.value = null;
  // IMPORTANT: Set the view and genre immediately for breadcrumbs
  currentView.value = 'genre';
  currentGenre.value = genre; // This is crucial for breadcrumbs
  navigationHistory.value = [];
  isZoomedToNode.value = false;
  
  // Force update to ensure reactivity for breadcrumbs
  nextTick(() => {
    console.log("Current breadcrumbs after genre update:", breadcrumbs.value);
  });
  
  // Track that we're loading genre-specific data
  isLoading.value = true;
  error.value = null;
  
  // Check if we have a tradition set
  if (!currentTradition.value) {
    const genreTradition = getTraditionForGenre(genre, traditions);
    // Fix the id reference
    if (genreTradition && genreTradition.id) {
      currentTradition.value = genreTradition.id;
    }
  }
  
  // Get current feature and level
  const feature = featureType.value;
  const level = levelType.value;
  
  // Map UI level to folder structure level
  const levelMapping = {
    'note': 'note_level',
    'segment': 'shared_segments',
    'combined': 'combined',
    'structure': 'structure_level'
  };
  const mappedLevel = levelMapping[level] || 'shared_segments';
  
  console.log(`Looking for ${genre} tree in ${currentTradition.value} tradition`);
  console.log(`Using feature: ${feature}, level: ${mappedLevel}`);
  
  // DIRECT APPROACH: Following the known file structure
  (async function() {
    // IMPORTANT: Based on your file system, we need to adjust the paths
    // The folder structure is actually:
    // genre_segmented/[level]/[tradition]/[genre]/[files]
    const paths = [
      // PRIMARY PATHS - Using the exact level, tradition, and genre path
      `./preprocessed_data/genre_segmented/${mappedLevel}/${currentTradition.value}/${genre}/`,
      `../preprocessed_data/genre_segmented/${mappedLevel}/${currentTradition.value}/${genre}/`,
      `preprocessed_data/genre_segmented/${mappedLevel}/${currentTradition.value}/${genre}/`,
      
      // SECONDARY PATHS - Try other levels for the same tradition/genre
      `./preprocessed_data/genre_segmented/combined/${currentTradition.value}/${genre}/`,
      `./preprocessed_data/genre_segmented/shared_segments/${currentTradition.value}/${genre}/`,
      `./preprocessed_data/genre_segmented/note_level/${currentTradition.value}/${genre}/`,
      `./preprocessed_data/genre_segmented/structure_level/${currentTradition.value}/${genre}/`,
      
      // FALLBACK PATHS - Try other locations
      `./preprocessed_data/genre/${currentTradition.value}/${genre}/`,
      `./preprocessed_data/tradition_segmented/genre/${currentTradition.value}/${genre}/`,
    ];
    
    // File patterns based on your actual files in each genre folder
    const files = [
      // Best matches for actual filenames in genre_segmented
      `${mappedLevel}_level_${feature}_phylogenetic_tree.json`,
      `${mappedLevel}_level_${feature}_all_genres_phylogenetic_tree.json`,
      `shared_segments_level_${feature}_all_genres_phylogenetic_tree.json`,
      `shared_segments_level_${feature}_phylogenetic_tree.json`,
      
      // Combined pattern files
      `combined_s75_ss25_${feature}_phylogenetic_tree.json`,
      `combined_s75_ss25_${feature}_all_genres_phylogenetic_tree.json`,
      `combined_s50_ss50_${feature}_all_genres_phylogenetic_tree.json`,
      
      // Generic patterns
      `${genre}_scores_tree.json`,
      `${genre}_tree.json`,
      `score_tree_${feature}_${genre}.json`
    ];
    
    console.log("Will try these paths:", paths);
    console.log("Will try these files:", files);
    
    let data = null;
    let foundPath = null;
    
    // Try each path and file combination
    for (const path of paths) {
      if (data) break;
      
      for (const file of files) {
        try {
          const fullPath = `${path}${file}`;
          console.log(`Trying path: ${fullPath}`);
          
          const response = await fetch(fullPath, { cache: 'no-cache' });
          
          if (response.ok) {
            console.log(`✅ SUCCESS! Found genre tree at: ${fullPath}`);
            data = await response.json();
            foundPath = fullPath;
            break;
          }
        } catch (err) {
          // Continue to next file
        }
      }
    }
    
    // If direct approach failed, try fallback loader
    if (!data) {
      console.log("Direct approach failed, trying fallback loader...");
      data = await loadGenrePhylogeneticTreeFallback(genre, currentTradition.value, feature, level);
    }
    
    // Process the data if we found it
    if (data) {
      console.log(`Successfully loaded genre tree from: ${foundPath || 'fallback method'}`);
      
      // Process tree data
      const processedData = enhanceTree(data);
      
      // Ensure the tree has a clear title
      if (!processedData.name || processedData.name === '') {
        processedData.name = `${genre.charAt(0).toUpperCase() + genre.slice(1)} Scores in ${traditions[currentTradition.value]?.name || currentTradition.value}`;
      }
      
      // Add tradition and genre info to all nodes if missing
      const addInfo = (node) => {
        if (!node.tradition) node.tradition = currentTradition.value;
        if (!node.genre) node.genre = genre;
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(addInfo);
        }
      };
      addInfo(processedData);
      
      // Update state and render
      currentTreeData.value = data;
      treeData.value = processedData;
      renderTree(processedData, treeContainer.value);
      dataLoaded.value = true;
    } else {
      // Create fallback view if no data found
      console.error(`Could not find any tree files for ${genre}`);
      createGenreFallbackTree(genre, currentTradition.value);
    }
    
    // Force a final update of the UI for breadcrumbs
    nextTick(() => {
      console.log("Final breadcrumbs after complete genre load:", breadcrumbs.value);
    });
    
    // Complete loading
    isLoading.value = false;
  })();
}

function debugGenreNavigation(genre, tradition) {
  console.group(`🔍 DEBUG: Genre Navigation for ${genre} in ${tradition}`);
  console.log(`Current view: ${currentView.value}`);
  console.log(`Feature: ${featureType.value}`);
  console.log(`Level: ${levelType.value}`);
  
  // Show folder structure
  const levelMapping = {
    'note': 'note_level',
    'segment': 'shared_segments', 
    'combined': 'combined',
    'structure': 'structure_level'
  };
  const mappedLevel = levelMapping[levelType.value] || 'shared_segments';
  
  console.log(`Will look in: ./preprocessed_data/genre_segmented/${mappedLevel}/${tradition}/${genre}/`);
  console.groupEnd();
}

async function loadGenrePhylogeneticTreeFallback(genre, tradition, feature, level) {
  console.log("Running fallback genre tree loader...");
  
  // All possible analysis levels
  const allLevels = ['shared_segments', 'combined', 'note_level', 'structure_level'];
  
  // Mapping between what's in props sidebar and folder structure
  const levelMapping = {
    'note': 'note_level',
    'segment': 'shared_segments',
    'combined': 'combined',
    'structure': 'structure_level'
  };
  
  // Map the sidebar level to your folder structure
  const mappedLevel = levelMapping[level] || 'shared_segments';
  
  // Base paths
  const basePaths = [
    './preprocessed_data/',
    '../preprocessed_data/',
    'preprocessed_data/'
  ];
  
  // Try each level
  for (const basePath of basePaths) {
    // First try the mapped level
    for (const searchLevel of [mappedLevel, ...allLevels]) {
      const pathsToTry = [
        `${basePath}genre_segmented/${searchLevel}/${tradition}/${genre}/`,
        `${basePath}tradition_segmented/genre/${tradition}/${genre}/`,
        `${basePath}genre/${tradition}/${genre}/`
      ];
      
      for (const path of pathsToTry) {
        const filesToTry = [
          // Based on actual files seen in your directories
          `${searchLevel}_level_${feature}_phylogenetic_tree.json`,
          `${searchLevel}_level_${feature}_all_genres_phylogenetic_tree.json`,
          `shared_segments_level_${feature}_phylogenetic_tree.json`,
          `shared_segments_level_${feature}_all_genres_phylogenetic_tree.json`,
          `combined_s75_ss25_${feature}_phylogenetic_tree.json`,
          `combined_s75_ss25_${feature}_all_genres_phylogenetic_tree.json`,
          `combined_s50_ss50_${feature}_phylogenetic_tree.json`,
          `${genre}_scores_tree.json`,
          `${genre}_tree.json`,
          `score_tree_${feature}_${genre}.json`
        ];
        
        for (const file of filesToTry) {
          try {
            const fullPath = `${path}${file}`;
            console.log(`Trying fallback: ${fullPath}`);
            
            const response = await fetch(fullPath, { cache: 'no-cache' });
            
            if (response.ok) {
              console.log(`✅ Fallback SUCCESS with: ${fullPath}`);
              return await response.json();
            }
          } catch (err) {
            // Continue to next file
          }
        }
      }
    }
  }
  
  // If we get here, we couldn't find any suitable files
  return null;
}

// Streamlined loadGenrePhylogeneticTree function with proper breadcrumb updates
async function loadGenrePhylogeneticTree(genre, tradition, feature, level) {
  if (!genre || !tradition) {
    console.error("Missing required parameters for genre tree loading");
    error.value = "Unable to load genre tree: missing information";
    isLoading.value = false;
    return;
  }
  
  // Set these state variables immediately and consistently
  // CRITICAL: These updates must happen early and consistently for breadcrumb navigation
  currentView.value = 'genre';
  currentGenre.value = genre;
  currentTradition.value = tradition;
  
  // Force update to ensure breadcrumb reactivity
  nextTick(() => {
    console.log("Breadcrumbs immediately after state update:", breadcrumbs.value);
  });
  
  isLoading.value = true;
  error.value = null;
  
  try {
    console.log(`Loading genre tree for: ${genre} in ${tradition} tradition`);
    console.log(`Current feature: ${feature}, level: ${level}`);
    
    // Direct mapping from UI filter to folder name
    const levelMapping = {
      'note': 'note_level',
      'segment': 'shared_segments',
      'combined': 'combined',
      'structure': 'structure_level'
    };
    
    const mappedLevel = levelMapping[level] || 'shared_segments';
    
    // Primary target path based on filters - this should be the most direct match
    // genre_segmented/[level]/[tradition]/[genre]/[level]_[feature]_all_genres_phylogenetic_tree.json
    const primaryPath = `preprocessed_data/genre_segmented/${mappedLevel}/${tradition}/${genre}/`;
    const primaryFile = `${mappedLevel}_${feature}_all_genres_phylogenetic_tree.json`;
    
    console.log(`Attempting to load primary target: ${primaryPath}${primaryFile}`);
    
    try {
      const response = await fetch(`${primaryPath}${primaryFile}`, { cache: 'no-cache' });
      
      if (response.ok) {
        console.log(`✅ SUCCESS! Found genre tree at: ${primaryPath}${primaryFile}`);
        const data = await response.json();
        
        // Process the data
        const processedData = enhanceTree(data);
        
        // Ensure the tree has a clear title
        if (!processedData.name || processedData.name === '') {
          processedData.name = `${genre.charAt(0).toUpperCase() + genre.slice(1)} Scores in ${traditions[tradition]?.name || tradition}`;
        }
        
        // Add tradition and genre info to all nodes if missing
        const addInfo = (node) => {
          if (!node.tradition) node.tradition = tradition;
          if (!node.genre) node.genre = genre;
          if (node.children && Array.isArray(node.children)) {
            node.children.forEach(addInfo);
          }
        };
        addInfo(processedData);
        
        // Update state and render
        currentTreeData.value = data;
        treeData.value = processedData;
        renderTree(processedData, treeContainer.value);
        dataLoaded.value = true;
        isLoading.value = false;
        
        // Double-check breadcrumbs after successful load
        nextTick(() => {
          console.log("Breadcrumbs after successful tree load:", breadcrumbs.value);
        });
        
        return;
      }
    } catch (err) {
      console.log(`❌ Error with primary path: ${primaryPath}${primaryFile}`, err.message);
    }
    
    // If primary path fails, try with alternative file naming patterns in the same directory
    const alternateFiles = [
      `${mappedLevel}_${feature}_phylogenetic_tree.json`,
      `shared_segments_level_${feature}_all_genres_phylogenetic_tree.json`,
      `shared_segments_level_${feature}_phylogenetic_tree.json`,
      `combined_s75_ss25_${feature}_all_genres_phylogenetic_tree.json`,
      `${genre}_tree.json`
    ];
    
    for (const file of alternateFiles) {
      try {
        const response = await fetch(`${primaryPath}${file}`, { cache: 'no-cache' });
        
        if (response.ok) {
          console.log(`✅ SUCCESS with alternate file: ${primaryPath}${file}`);
          const data = await response.json();
          
          // Process the data
          const processedData = enhanceTree(data);
          
          // Add title and metadata
          if (!processedData.name || processedData.name === '') {
            processedData.name = `${genre.charAt(0).toUpperCase() + genre.slice(1)} Scores in ${traditions[tradition]?.name || tradition}`;
          }
          
          const addInfo = (node) => {
            if (!node.tradition) node.tradition = tradition;
            if (!node.genre) node.genre = genre;
            if (node.children && Array.isArray(node.children)) {
              node.children.forEach(addInfo);
            }
          };
          addInfo(processedData);
          
          // Update state and render
          currentTreeData.value = data;
          treeData.value = processedData;
          renderTree(processedData, treeContainer.value);
          dataLoaded.value = true;
          isLoading.value = false;
          
          return;
        }
      } catch (err) {
        // Continue to next file
      }
    }
    
    // If all direct approaches fail, fall back to more comprehensive search
    console.log("Direct approaches failed, falling back to broader search...");
    
    // Call the existing fallback function
    const data = await loadGenrePhylogeneticTreeFallback(genre, tradition, feature, level);
    
    if (data) {
      const processedData = enhanceTree(data);
      
      if (!processedData.name || processedData.name === '') {
        processedData.name = `${genre.charAt(0).toUpperCase() + genre.slice(1)} Scores in ${traditions[tradition]?.name || tradition}`;
      }
      
      const addInfo = (node) => {
        if (!node.tradition) node.tradition = tradition;
        if (!node.genre) node.genre = genre;
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(addInfo);
        }
      };
      addInfo(processedData);
      
      currentTreeData.value = data;
      treeData.value = processedData;
      renderTree(processedData, treeContainer.value);
      dataLoaded.value = true;
    } else {
      console.error(`Could not find any tree files for ${genre} in ${tradition}`);
      createGenreFallbackTree(genre, tradition);
    }
    
  } catch (err) {
    console.error(`Error loading genre tree for ${genre}:`, err);
    error.value = `Error loading genre tree: ${err.message}`;
    createGenreFallbackTree(genre, tradition);
  } finally {
    // CRITICAL: Make one final check to ensure genre is still set
    if (currentView.value === 'genre' && currentGenre.value !== genre) {
      console.log("Fixing inconsistent genre state");
      currentGenre.value = genre;
    }
    
    isLoading.value = false;
  }
}

function createGenreFallbackTree(genre, tradition) {
  console.log(`Creating fallback tree for ${genre} in ${tradition}`);
  
  try {
    // Create a simple fallback tree
    const genreTree = {
      name: `${genre.charAt(0).toUpperCase() + genre.slice(1)} Scores in ${traditions[tradition]?.name || tradition}`,
      genre: genre,
      tradition: tradition,
      color: traditions[tradition]?.color || "#999",
      children: [
        {
          name: "No score data found",
          genre: genre,
          tradition: tradition,
          color: traditions[tradition]?.color || "#999",
          display_name: "No score data found"
        }
      ]
    };
    
    const processedData = enhanceTree(genreTree);
    currentTreeData.value = genreTree;
    treeData.value = processedData;
    renderTree(processedData, treeContainer.value);
    dataLoaded.value = true;
  } catch (err) {
    console.error("Error creating fallback tree:", err);
    error.value = `Error creating fallback: ${err.message}`;
  } finally {
    // Ensure loading is reset even if there's an error
    isLoading.value = false;
  }
}

// Updated goBack function to handle both zoom navigation and abstraction level navigation
function goBack() {
  // First check if there's zoom navigation history within the current view
  if (navigationHistory.value.length > 0) {
    // If we have zoom history, go back to previous zoom state
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
  // If there's no zoom history, navigate up one abstraction level
  else if (currentView.value === 'genre' && currentTradition.value) {
    // If in genre view, go back to tradition view
    currentGenre.value = null;
    currentView.value = 'tradition';
    selectedNode.value = null;
    navigationHistory.value = [];
    isZoomedToNode.value = false;
    loadTreeData();
  } 
  else if (currentView.value === 'tradition') {
    // If in tradition view, go back to traditions overview
    currentTradition.value = null;
    currentView.value = 'traditions';
    selectedNode.value = null;
    navigationHistory.value = [];
    isZoomedToNode.value = false;
    loadTreeData();
  }
}

// INTERACTION HANDLERS
// Replace the original handleNodeClick with this updated version
function handleNodeClick(event, d) {
  event.stopPropagation();
  
  try {
    console.log("Node clicked:", d.data);
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
    
    // Handle score nodes in genre view
    if (currentView.value === 'genre') {
      // Check if this is a score node using multiple criteria
      if (!d.children || // Leaf nodes in genre view are likely scores
          d.data.name?.includes('.krn') || 
          d.data.name?.includes('.musicxml') || 
          d.data.attributes || 
          d.data.length) {
        
        console.log('Score node clicked:', d.data);
        // Use nextTick to ensure state is updated before navigation
        nextTick(() => {
          navigateToScore(d.data);
        });
        return;
      }
    }
    
    // Handle tradition node clicks (Irish or Galician)
    if (currentView.value === 'traditions' && d.data.tradition) {
      const tradition = d.data.tradition;
      
      if (tradition === 'irish' || tradition === 'galician' || tradition === 'portuguese') {
        currentTradition.value = tradition;
        currentView.value = 'tradition';
        
        console.log(`Loading tradition-specific tree for ${tradition}`);
        loadSpecialTree(tradition);
        return;
      }
      
      setTimeout(() => navigateToTradition(d.data.tradition), 750);
      return;
    }
    
    // Handle combined view parent node
    if (currentView.value === 'traditions' && !d.data.tradition && d.children) {
      const hasIrishGalicianChildren = d.children.some(child => 
        child.data.tradition === 'irish' || child.data.tradition === 'galician');
      
      if (hasIrishGalicianChildren) {
        selectedNode.value = d;
        currentView.value = 'combined'; 
        loadSpecialTree();
        return;
      }
    }
    
    // Handle genre node clicks
    if ((currentView.value === 'tradition' || currentView.value === 'combined')) {
      // Additional debugging for genre clicks
      console.log("Checking for genre node:", d.data);
      console.log("Has genre property:", !!d.data.genre);
      
      // First check for explicit genre property
      if (d.data.genre) {
        const genreName = d.data.genre.toLowerCase();
        console.log(`🎯 Detected genre node click: ${genreName}`);
        
        // Make sure we have a valid tradition
        if (d.data.tradition) {
          currentTradition.value = d.data.tradition;
        } else if (!currentTradition.value) {
          // Try to determine tradition from genre
          const genreTradition = getTraditionForGenre(genreName, traditions);
          if (genreTradition) {
            currentTradition.value = genreTradition;
          }
        }
        
        // Set these values in the right order
        currentView.value = 'genre';
        currentGenre.value = genreName;
        
        // Force a UI update right away with nextTick
        nextTick(() => {
          console.log("State after click:", { 
            view: currentView.value, 
            genre: currentGenre.value,
            tradition: currentTradition.value
          });
          
          // Then load the tree data
          loadGenrePhylogeneticTree(genreName, currentTradition.value, featureType.value, levelType.value);
        });
        
        return;
      }
      // Try secondary detection methods 
      else if (d.data.name && !d.children) {
        // Check if the name matches a known genre
        const genreName = d.data.name.toLowerCase();
        let matchingGenre = false;
        
        // Check all traditions for this genre name
        Object.values(traditions).forEach(t => {
          if (t.genres && t.genres.includes(genreName)) {
            matchingGenre = true;
          }
        });
        
        if (matchingGenre) {
          console.log(`🎯 Detected genre node by name: ${genreName}`);
          
          // Set state before loading the tree
          currentView.value = 'genre';
          currentGenre.value = genreName;
          
          // Force Vue to update the UI with nextTick
          nextTick(() => {
            console.log("Breadcrumbs after name-based genre click:", breadcrumbs.value);
            loadGenrePhylogeneticTree(genreName, currentTradition.value, featureType.value, levelType.value);
          });
          
          return;
        }
        console.log("Name matched no known genre:", genreName);
      }
    }
    
    // Debugging: Log any unhandled clicks
    console.log('Node click without specific handling:', d.data);
  } catch (err) {
    console.error("Error handling node click:", err);
    error.value = `Error navigating: ${err.message}`;
    // Make sure loading state is reset if there's an error
    isLoading.value = false;
  }
}

// Updated loadSpecialTree function that follows consistent rules for all genre tree paths
async function loadSpecialTree(specificTradition = null) {
  isLoading.value = true;
  error.value = null;
  
  try {
    // Get the current feature and level types
    const feature = featureType.value;
    const level = levelType.value;
    
    console.log(`Loading special tree for: ${specificTradition || 'combined view (Celtic)'}`);
    console.log(`Current feature: ${feature}, level: ${level}`);
    
    // 1. MAP LEVEL FILTER TO FILE PATTERN - CONSISTENT FOR ALL TREES
    let levelPattern;
    if (level === 'note') {
      levelPattern = 'note';
    } else if (level === 'segment') {
      levelPattern = 'shared_segments';
    } else if (level === 'structure') {
      levelPattern = 'structure';
    } else if (level === 'combined') {
      levelPattern = 'combined_s75_ss25';
    } else {
      // Fallback
      levelPattern = 'combined_s75_ss25';
    }
    
    // 2. DETERMINE THE TARGET FOLDER - ALWAYS IN tradition_segmented/genre/
    let targetFolder;
    if (specificTradition) {
      // For Irish or Galician trees
      targetFolder = `tradition_segmented/genre/${specificTradition}/`;
    } else {
      // For Celtic combined tree
      targetFolder = 'tradition_segmented/genre/both/';
    }
    
    // 3. DETERMINE EXACT FILENAME BASED ON LEVEL PATTERN AND FEATURE
    let targetFile = `genre_tree_${levelPattern}_${feature}.json`;
    
    console.log(`Target folder: ${targetFolder}`);
    console.log(`Target file: ${targetFile}`);
    
    // 4. SET UP CURRENT VIEW
    if (specificTradition) {
      currentTradition.value = specificTradition;
      currentView.value = 'tradition';
      currentGenre.value = null;
    } else {
      currentView.value = 'combined';
    }
    
    // 5. DETECTION FOR ENVIRONMENT
    const isProduction = window.location.hostname !== 'localhost' && 
                        window.location.hostname !== '127.0.0.1';
    
    // 6. BASE PATHS DEPEND ON ENVIRONMENT
    const basePaths = isProduction ? [
      `${import.meta.env.BASE_URL}preprocessed_data/`,
      `${import.meta.env.BASE_URL}dist/preprocessed_data/`,
      `${import.meta.env.BASE_URL}`,
      `${import.meta.env.BASE_URL}dist/`
    ] : [
      './preprocessed_data/',
      '../preprocessed_data/',
      'preprocessed_data/',
      './',
      '../'
    ];
    
    // 7. TRY LOADING THE EXACT TARGET FILE
    let data = null;
    let workingPath = null;
    
    // Try each base path
    for (const basePath of basePaths) {
      if (data) break;
      
      try {
        const fullPath = `${basePath}${targetFolder}${targetFile}`;
        console.log(`Trying primary target: ${fullPath}`);
        
        const response = await fetch(fullPath, { cache: 'no-cache' });
        
        if (response.ok) {
          console.log(`✅ Success with primary target: ${fullPath}`);
          data = await response.json();
          workingPath = fullPath;
          break;
        }
      } catch (err) {
        console.log(`❌ Error with primary target path: ${err.message}`);
      }
    }
    
    // 8. IF EXACT FILE NOT FOUND, TRY FALLBACKS IN SAME FOLDER
    if (!data) {
      console.log("Primary target not found, trying fallbacks in same folder");
      
      // Create array of fallback files to try in the same folder
      const fallbackFiles = [
        // Try alternative level-specific patterns
        `genre_tree_${level}_${feature}.json`,
        `${specificTradition || 'both'}_genre_tree_${levelPattern}_${feature}.json`,
        
        // Try without level specification
        `genre_tree_${feature}.json`,
        
        // Generic fallbacks
        `${specificTradition || 'both'}_genre_tree.json`,
        `genre_tree_${specificTradition || 'both'}.json`,
        `genre_tree.json`
      ];
      
      // Try each fallback file
      for (const basePath of basePaths) {
        if (data) break;
        
        for (const fallbackFile of fallbackFiles) {
          try {
            const fullPath = `${basePath}${targetFolder}${fallbackFile}`;
            console.log(`Trying fallback: ${fullPath}`);
            
            const response = await fetch(fullPath, { cache: 'no-cache' });
            
            if (response.ok) {
              console.log(`✅ Success with fallback: ${fullPath}`);
              data = await response.json();
              workingPath = fullPath;
              break;
            }
          } catch (err) {
            // Continue to next file
          }
        }
      }
    }
    
    // 9. IF STILL NO DATA, CREATE FALLBACK TREE
    if (!data) {
      console.log("No suitable files found, creating fallback tree");
      
      if (specificTradition) {
        // Create a custom genre tree for this tradition
        const traditionGenres = traditions[specificTradition]?.genres || [];
        const traditionColor = traditions[specificTradition]?.color || "#999";
        
        data = {
          name: `${specificTradition.charAt(0).toUpperCase() + specificTradition.slice(1)} Genres`,
          tradition: specificTradition,
          color: traditionColor,
          children: traditionGenres.map(genre => ({
            name: genre.charAt(0).toUpperCase() + genre.slice(1),
            genre: genre,
            tradition: specificTradition,
            color: traditionColor,
            display_name: genre.charAt(0).toUpperCase() + genre.slice(1)
          }))
        };
      } else {
        // Create combined Celtic view
        const combinedTree = {
          name: "Celtic Music Traditions",
          children: []
        };
        
        // Add Irish branch
        if (traditions.irish) {
          const irishNode = {
            name: "Irish Tradition",
            tradition: "irish",
            color: traditions.irish.color,
            children: traditions.irish.genres.map(genre => ({
              name: genre.charAt(0).toUpperCase() + genre.slice(1),
              genre: genre,
              tradition: "irish",
              color: traditions.irish.color,
              display_name: genre.charAt(0).toUpperCase() + genre.slice(1)
            }))
          };
          combinedTree.children.push(irishNode);
        }
        
        // Add Galician branch
        if (traditions.galician) {
          const galicianNode = {
            name: "Galician Tradition",
            tradition: "galician",
            color: traditions.galician.color,
            children: traditions.galician.genres.map(genre => ({
              name: genre.charAt(0).toUpperCase() + genre.slice(1),
              genre: genre,
              tradition: "galician",
              color: traditions.galician.color,
              display_name: genre.charAt(0).toUpperCase() + genre.slice(1)
            }))
          };
          combinedTree.children.push(galicianNode);
        }
        
        data = combinedTree;
      }
      
      workingPath = "generated-fallback-tree";
    }
    
    // 10. PROCESS THE LOADED DATA
    console.log(`Successfully loaded/generated data from: ${workingPath}`);
    currentTreeData.value = data;
    
    // Add tradition info to all nodes if needed
    if (specificTradition && data) {
      const addTradition = (node) => {
        if (!node.tradition) {
          node.tradition = specificTradition;
        }
        if (node.children) {
          node.children.forEach(addTradition);
        }
      };
      addTradition(data);
      
      // Set display_name if it's a genre and missing
      const addDisplayNames = (node) => {
        if (node.genre && !node.display_name) {
          node.display_name = node.genre.charAt(0).toUpperCase() + node.genre.slice(1);
        }
        if (node.children) {
          node.children.forEach(addDisplayNames);
        }
      };
      addDisplayNames(data);
    }
    
    // Process the tree using our enhancer
    const processedData = enhanceTree(data);
    treeData.value = processedData;
    
    // Update visualization
    renderTree(processedData, treeContainer.value);
    dataLoaded.value = true;
    
    console.log(`Successfully rendered tree for ${specificTradition || 'Celtic combined view'}`);
  } catch (err) {
    console.error('Error loading special tree:', err);
    error.value = `Error loading tree: ${err.message}`;
    
    // Fall back to hardcoded tree
    console.log('Falling back to hardcoded tree');
    renderTree(traditionsTree, treeContainer.value);
  } finally {
    isLoading.value = false;
  }
}

// Helper function to determine if a tree has genres or songs
function checkIfGenreList(data) {
  if (!data || !data.children) return false;
  
  // Try to detect if this is a genre-level tree or a song-level tree
  let isGenreList = false;
  
  // Method 1: Check if nodes have ".krn" in their name (indicates songs)
  const hasSongs = findNodeWithPattern(data, node => 
    node.name && typeof node.name === 'string' && node.name.includes('.krn')
  );
  
  if (!hasSongs) {
    isGenreList = true;
  }
  
  // Method 2: Check if nodes are labeled as genres
  const hasGenreNodes = findNodeWithPattern(data, node =>
    node.display_name && 
    traditions.irish.genres.includes(node.display_name.toLowerCase()) || 
    traditions.galician.genres.includes(node.display_name.toLowerCase())
  );
  
  if (hasGenreNodes) {
    isGenreList = true;
  }
  
  return isGenreList;
}

// Fix the parentheses in the isScoreNode function
function isScoreNode(node) {
  // Case 1: Node has a .krn or .musicxml file extension in its name
  if (node.name && typeof node.name === 'string' && 
     (node.name.includes('.krn') || node.name.includes('.musicxml'))) {
    return true;
  }
  
  // Case 2: Node is in genre view and is a leaf node (no children)
  if (currentView.value === 'genre' && !node.children) {
    return true;
  }
  
  // Case 3: Node has attributes specific to scores
  if (node.attributes || node.length || node.meter || node.key) {
    return true;
  }
  
  return false;
}

// Helper function to find nodes with certain patterns
function findNodeWithPattern(node, checkFn) {
  if (!node) return false;
  
  // Check this node
  if (checkFn(node)) return true;
  
  // Check children recursively
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (findNodeWithPattern(child, checkFn)) return true;
    }
  }
  
  return false;
}

// VISUALIZATION RENDERING
// Modified renderTree function with improved density handling
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
  
  // Count the number of leaf nodes to determine density
  const leafCount = countLeafNodes(root);
  console.log(`Tree contains ${leafCount} leaf nodes`);
  
  // Dynamically adjust spacing based on the number of nodes
  const layoutConfig = getContentAwareLayoutConfig(currentView.value, containerWidth, containerHeight, leafCount, data);
  
  // Apply the tree layout with dynamic configuration
  const treeLayout = d3.tree()
    .size(layoutConfig.size)
    .separation((a, b) => {
      // Increase separation between nodes based on content
      return layoutConfig.separation * (a.parent === b.parent ? 1 : 1.5);
    });
    
  const treeData = treeLayout(root);
  
  // Render links
  renderTreeLinks(g, treeData);
  
  // Render nodes
  renderTreeNodes(g, treeData, layoutConfig);
  
  // Center the tree initially with appropriate zoom
  centerTree(svg, g, containerWidth, containerHeight, leafCount);
  
  // Add title for tradition-specific views
  if (data.tradition || currentView.value === 'tradition') {
    const titleText = data.tradition ? 
      `${data.name || data.tradition.charAt(0).toUpperCase() + data.tradition.slice(1) + ' Genres'}` :
      data.name || 'Genre Tree';
      
    svg.append('text')
      .attr('x', containerWidth / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-size', '16px')
      .attr('font-weight', 'bold')
      .text(titleText);
  }
  
  // Add layout toggle button for dense trees
  if (leafCount > 40) {
    addLayoutToggleButton(data, container, leafCount);
  }
  
  // Modify the zoom behavior to show/hide text based on zoom level
  zoomBehavior.value.on('zoom', (event) => {
    // Move the tree based on zoom
    d3.select(treeContainer.value)
      .select('svg g')
      .attr('transform', event.transform);
    
    currentZoom.value = event.transform.k;
    
    // Show/hide text based on zoom level for dense trees
    if (leafCount > 30) {
      d3.select(treeContainer.value).selectAll('.node-label')
        .attr('opacity', d => {
          // Always show parent node text
          if (d.children) return 1;
          
          // For leaf nodes in dense trees, only show text when zoomed in enough
          return event.transform.k > 1.2 ? 1 : 0;
        });
    }
  });
}

// New function to add a radial layout toggle button
function addLayoutToggleButton(data, container, leafCount) {
  const button = d3.select(container)
    .append('div')
    .attr('class', 'layout-toggle')
    .style('position', 'absolute')
    .style('top', '10px')
    .style('right', '10px')
    .style('padding', '5px 10px')
    .style('background', 'rgba(255,255,255,0.8)')
    .style('border', '1px solid #ccc')
    .style('border-radius', '4px')
    .style('cursor', 'pointer')
    .style('user-select', 'none')
    .text('Try Radial Layout')
    .on('click', () => {
      if (button.text() === 'Try Radial Layout') {
        switchToRadialLayout(data, container, leafCount);
        button.text('Switch to Tree Layout');
      } else {
        renderTree(data, container);
        button.text('Try Radial Layout');
      }
    });
}



// Dynamic layout configuration based on content and view type
function getContentAwareLayoutConfig(view, width, height, leafCount, data) {
  // Base configuration adjusted for view type
  let config = { 
    size: [0, 0],
    separation: 1,
    nodeRadius: (d) => d.children ? 7 : 5,
    textOffset: 15,
    fontSize: '12px'
  };
  
  // Determine if this is a dense tree
  const isDenseTree = leafCount > 20;
  const isVeryDenseTree = leafCount > 40;
  const isSparseTraditionTree = view === 'traditions' && leafCount < 10;
  const isTraditionSpecificTree = !!data.tradition;
  
  // Adjust vertical spacing (height component) based on density
  let heightFactor;
  if (isVeryDenseTree) {
    heightFactor = 1.2; // More vertical space for very dense trees
    config.separation = 1.5;
    config.fontSize = '11px';
  } else if (isDenseTree) {
    heightFactor = 1.0; // Standard spacing for dense trees
    config.separation = 1.3;
  } else if (isSparseTraditionTree) {
    heightFactor = 0.5; // Less vertical space for sparse tradition trees
    config.separation = 0.9;
    config.fontSize = '13px';
  } else {
    heightFactor = 0.8; // Default for regular trees
    config.separation = 1.1;
  }
  
  // Adjust horizontal spacing (width component) based on tree type
  let widthFactor;
  if (isVeryDenseTree) {
    widthFactor = 0.8; // More compressed for very dense trees
  } else if (isTraditionSpecificTree) {
    widthFactor = 0.6; // More spread out for tradition-specific trees
  } else {
    widthFactor = 0.7; // Default for most trees
  }
  
  // Set final size based on view type and density factors
  switch(view) {
    case 'traditions':
      config.size = [height * heightFactor, width * widthFactor];
      break;
    case 'tradition':
      config.size = [height * heightFactor, width * widthFactor];
      break;
    case 'genre':
      config.size = [height * heightFactor, width * widthFactor];
      break;
    default:
      config.size = [height * 0.9, width * 0.7];
  }
  
  // If there are a lot of nodes, make nodes slightly smaller for better visibility
  if (isVeryDenseTree) {
    config.nodeRadius = (d) => !d.children && d.data.genre ? 4.5 : (d.children ? 6 : 4);
    config.textOffset = 12;
  } else if (isDenseTree) {
    config.nodeRadius = (d) => !d.children && d.data.genre ? 5 : (d.children ? 6.5 : 4.5);
    config.textOffset = 13;
  }
  
  return config;
}

// Helper function to count leaf nodes (gives us a sense of tree density)
function countLeafNodes(node) {
  if (!node.children) return 1;
  return node.children.reduce((sum, child) => sum + countLeafNodes(child), 0);
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

// Enhanced tree link rendering with dynamic styling based on tree density
function renderTreeLinks(g, treeData) {
  // Count descendants to gauge tree complexity
  const nodeCount = treeData.descendants().length;
  const isDense = nodeCount > 30;
  
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
    .attr("stroke-width", d => {
      // Adjust stroke width based on tree density
      if (isDense) return 1.5;
      return currentView.value === 'traditions' && d.target.data.tradition ? 2.5 : 2;
    })
    .attr("stroke-opacity", isDense ? 0.6 : 0.8);
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

// Enhanced renderTreeNodes function with text truncation and better positioning
function renderTreeNodes(g, treeData, layoutConfig) {
  // Get tree density information
  const leafCount = countLeafNodes(treeData);
  const isDense = leafCount > 20;
  
  const node = g.selectAll('.node')
    .data(treeData.descendants())
    .enter()
    .append('g')
    .attr('class', d => {
      const traditionClass = getNodeTradition(d);
      return `node ${d.children ? 'node--internal' : 'node--leaf'} ${traditionClass}`;
    })
    .attr('transform', d => `translate(${d.y}, ${d.x})`)
    .on('click', handleNodeClick)
    // Add hover interactions for better usability
    .on('mouseover', function(event, d) {
      // Highlight the current node
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', d => d.children ? 10 : 8)
        .attr('stroke-width', 2);
        
      // Make the text more visible
      d3.select(this).select('text')
        .transition()
        .duration(200)
        .attr('font-weight', 'bold')
        .attr('font-size', parseInt(layoutConfig.fontSize) + 1 + 'px');
        
      // Highlight connected links
      d3.select(treeContainer.value).selectAll('.link')
        .filter(link => link.source === d || link.target === d)
        .transition()
        .duration(200)
        .attr('stroke-width', 3)
        .attr('stroke-opacity', 1);
    })
    .on('mouseout', function(event, d) {
      // Reset node appearance
      if (d !== selectedNode.value?.data) {
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('r', d => layoutConfig.nodeRadius(d))
          .attr('stroke-width', d => !d.children && d.data.genre ? 2 : 1.5);
      }
      
      // Reset text appearance
      d3.select(this).select('text')
        .transition()
        .duration(200)
        .attr('font-weight', 'normal')
        .attr('font-size', layoutConfig.fontSize);
        
      // Reset links
      d3.select(treeContainer.value).selectAll('.link')
        .transition()
        .duration(200)
        .attr('stroke-width', isDense ? 1.5 : 2)
        .attr('stroke-opacity', isDense ? 0.6 : 0.8);
    });
  
  // Add circles for nodes with dynamic sizing
  node.append('circle')
    .attr('r', d => layoutConfig.nodeRadius(d))
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', '#fff')
    .attr('stroke-width', d => !d.children && d.data.genre ? 2 : 1.5);
  
  // Add text labels with truncation for dense trees
  node.append('text')
    .attr('dy', d => !d.children ? '0.31em' : (d.children ? '-10' : '12'))
    .attr('x', d => !d.children ? layoutConfig.textOffset : 0)
    .attr('text-anchor', d => d.children ? 'middle' : 'start')
    .attr('dominant-baseline', 'middle')
    .attr('class', 'node-label')
    .attr('opacity', d => {
      // Hide text for leaf nodes initially when there are many nodes
      if (leafCount > 40 && !d.children) return 0;
      return 1;
    })
    .text(d => {
      // Get the appropriate text based on view
      let text = '';
      
      // When in genre view, only show music name (without the genre info)
      if (currentView.value === 'genre') {
        // For scores in the genre view, show only the file name, without genre info
        if (d.data.name) {
          // If it's a file name, remove genre prefix and show only the music name
          if (d.data.name.includes('.krn')) {
            const parts = d.data.name.split('_');
            if (parts.length >= 3) {
              // Remove tradition/genre prefixes, keep only the music title
              text = parts.slice(2).join('_').replace(/\.krn$/, '');
            } else {
              text = d.data.name.replace(/\.krn$/, '');
            }
          } else {
            text = d.data.name;
          }
        }
      } else {
        // For other views, use the existing logic
        if (d.data.display_name) text = d.data.display_name;
        else if (currentView.value === 'traditions' && d.data.name && d.data.name !== '') {
          text = d.data.name.charAt(0).toUpperCase() + d.data.name.slice(1);
        }
        else if (d.data.genre) text = d.data.genre.charAt(0).toUpperCase() + d.data.genre.slice(1);
      }
      
      // Truncate long names in dense areas based on tree density
      const maxLength = leafCount > 50 ? 12 : (leafCount > 30 ? 15 : 20);
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    })
    .attr('font-size', layoutConfig.fontSize)
    .attr('fill', '#333');
  
  // Add tooltips with full text info
  node.append('title')
    .text(d => getNodeTooltip(d));
  
  // After rendering, adjust text positions to prevent overlap
  setTimeout(() => adjustTextPositions(leafCount), 100);
}

// New function to adjust text positions to prevent overlap
function adjustTextPositions(leafCount) {
  // Only apply in dense trees
  if (leafCount < 20) return;
  
  const textElements = d3.select(treeContainer.value)
    .selectAll('.node text');
  
  // Simple collision detection loop
  for (let iterations = 0; iterations < 3; iterations++) {
    const positions = [];
    
    textElements.each(function(d) {
      // Get text position
      const x = d.y;
      const y = d.x;
      const width = this.getComputedTextLength();
      const height = 16; // approximate text height
      
      // Store position for collision detection
      positions.push({
        element: this,
        x: x,
        y: y,
        width: width,
        height: height,
        data: d
      });
    });
    
    // Check for collisions
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        
        // Simple rectangle overlap detection
        if (Math.abs(a.y - b.y) < (a.height + b.height) / 2 && 
            a.x < b.x + b.width && a.x + a.width > b.x) {
          
          // Adjust vertical position for leaf nodes
          if (!a.data.children && !b.data.children) {
            // Move one label up and one down
            d3.select(a.element).attr('dy', '1.2em');
            d3.select(b.element).attr('dy', '-0.5em');
          }
        }
      }
    }
  }
}

function getNodeColor(d) {
  // First determine if we have a genre
  if (d.data.genre) {
    // Try to get the tradition directly from the node
    if (d.data.tradition) {
      return traditions[d.data.tradition]?.color || '#999';
    }
    
    // If no tradition is specified, try to determine it from the genre
    const genreTradition = getTraditionForGenre(d.data.genre, traditions);
    if (genreTradition) {
      return traditions[genreTradition.id]?.color || '#999';
    }
    
    // If we're in a specific tradition view, use that tradition's color
    if (currentView.value === 'tradition' || currentView.value === 'genre') {
      return traditions[currentTradition.value]?.color || '#999';
    }
  }
  
  // If it's a tradition node, use its color
  if (d.data.tradition) {
    return traditions[d.data.tradition]?.color || '#999';
  }
  
  // For nodes without genre or tradition, check if it's a genre name
  if (d.data.name && d.data.name !== '') {
    // Try to match the name to a known genre
    for (const [tradId, trad] of Object.entries(traditions)) {
      if (trad.genres.includes(d.data.name.toLowerCase())) {
        return trad.color;
      }
    }
    
    // If it's in traditions view and has a name but no determined color
    if (currentView.value === 'traditions') {
      const genre = genres.value.find(g => g.name.toLowerCase() === d.data.name.toLowerCase());
      return genre ? genre.color : '#999';
    }
  }
  
  // Default color if nothing else matches
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
// Updated centerTree function with adaptive zoom based on node count
function centerTree(svg, g, width, height, leafCount) {
  const bounds = g.node().getBBox();
  const dx = bounds.width;
  const dy = bounds.height;
  const x = bounds.x;
  const y = bounds.y;
  
  // Adjust scale based on tree density
  let scaleFactor = 0.9;
  if (leafCount > 40) scaleFactor = 0.8; // For very dense trees, zoom out a bit
  if (leafCount > 60) scaleFactor = 0.7; // For extremely dense trees, zoom out more
  
  const scale = scaleFactor / Math.max(dx / width, dy / height);
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

// Enhanced watcher for feature and level changes from sidebar
watch([featureType, levelType], ([newFeature, newLevel], [oldFeature, oldLevel]) => {
  console.log(`Analysis params changed: feature=${newFeature}, level=${newLevel}`);
  console.log(`Previous values: feature=${oldFeature}, level=${oldLevel}`);
  
  // Don't reload if the values didn't actually change
  if (newFeature === oldFeature && newLevel === oldLevel) return;
  
  // Track what we're currently viewing
  const currentlyViewing = {
    view: currentView.value,
    tradition: currentTradition.value,
    genre: currentGenre.value
  };
  
  console.log(`Current view state: ${JSON.stringify(currentlyViewing)}`);
  
  // Handle different view types with appropriate loading functions
  if (currentlyViewing.view === 'genre' && currentlyViewing.genre && currentlyViewing.tradition) {
    // If we're viewing a specific genre, reload that genre with new filters
    console.log(`Reloading genre ${currentlyViewing.genre} with new filters`);
    loadGenrePhylogeneticTree(
      currentlyViewing.genre,
      currentlyViewing.tradition, 
      newFeature, 
      newLevel
    );
  } 
  else if (currentlyViewing.view === 'tradition' && currentlyViewing.tradition) {
    // If we're viewing a specific tradition, reload that tradition with new filters
    console.log(`Reloading tradition ${currentlyViewing.tradition} with new filters`);
    loadSpecialTree(currentlyViewing.tradition);
  }
  else if (currentlyViewing.view === 'combined') {
    // If we're viewing the combined view, reload it with new filters
    console.log(`Reloading combined view with new filters`);
    loadSpecialTree();
  } 
  else {
    // For traditions overview or any other view, use loadTreeData
    loadTreeData();
  }
}, { deep: true });

// Enhanced onMounted function with comprehensive error logging
// Minimalist onMounted function
onMounted(() => {
  try {
    console.log("Initializing visualization...");
    
    // Initialize zoom behavior
    zoomBehavior.value = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        d3.select(treeContainer.value)
          .select('svg g')
          .attr('transform', event.transform);
        currentZoom.value = event.transform.k;
      });
    
    // Give DOM time to render
    setTimeout(() => {
      if (treeContainer.value) {
        // Test rendering to verify D3 works
        const testSvg = d3.select(treeContainer.value)
          .append("svg")
          .attr("width", 100)
          .attr("height", 100);
          
        testSvg.append("circle")
          .attr("cx", 50)
          .attr("cy", 50)
          .attr("r", 40)
          .attr("fill", "blue");
        
        // Remove test SVG and load real data
        setTimeout(() => {
          d3.select(treeContainer.value).selectAll("svg").remove();
          loadTreeData();
        }, 500);
      } else {
        error.value = 'Visualization container not available';
        isLoading.value = false;
      }
    }, 100);
  } catch (err) {
    console.error("Initialization error:", err);
    error.value = `Initialization error: ${err.message}`;
    isLoading.value = false;
  }
});
</script>

<template>
  <main class="visualization-area">
    <!-- Enhanced Breadcrumb navigation - Made more prominent in score view -->
    <div class="breadcrumb-navigation" :class="{'score-breadcrumbs': currentView === 'score' || currentView === 'compare'}">
      <ul class="breadcrumbs">
        <li v-for="(crumb, index) in breadcrumbs" :key="index" 
            class="breadcrumb-item" 
            :class="{'active': index === breadcrumbs.length - 1}">
          <a href="#" 
            @click.prevent="navigateToBreadcrumb(crumb)" 
            class="breadcrumb-link"
            :class="{'current-view': index === breadcrumbs.length - 1}">
            <span v-if="index === 0">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.707 1.5ZM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5 5 5Z"/>
              </svg>
              {{ crumb.text }}
            </span>
            <!-- For tradition crumb -->
            <span v-else-if="crumb.view === 'tradition'" class="tradition-crumb" 
                  :style="{color: traditions[crumb.tradition]?.color}">
              {{ crumb.text }}
            </span>
            <!-- For genre crumb -->
            <span v-else-if="crumb.view === 'genre'" class="genre-crumb"
                  :style="{color: traditions[crumb.tradition]?.color}">
              {{ crumb.text }}
            </span>
            <!-- For score crumb -->
            <span v-else-if="crumb.view === 'score'" class="score-crumb"
                  :style="{color: traditions[crumb.tradition]?.color}">
              {{ crumb.text }}
            </span>
            <!-- For compare view -->
            <span v-else-if="crumb.view === 'compare'" class="compare-crumb"
                  :style="{color: traditions[crumb.tradition]?.color}">
              {{ crumb.text }}
            </span>
            <span v-else>
              {{ crumb.text }}
            </span>
          </a>
          <span v-if="index < breadcrumbs.length - 1" class="separator">&gt;</span>
        </li>
      </ul>
      
      <!-- Back button for more obvious navigation in score view -->
      <button v-if="currentView === 'score' || currentView === 'compare'" 
              @click="currentView === 'compare' ? exitCompareView() : navigateToBreadcrumb(breadcrumbs[breadcrumbs.length - 2] || breadcrumbs[0])" 
              class="back-button">
        ← Back to {{ currentGenre.value }} Scores
      </button>
    </div>
    
    <!-- Tree Visualization Container (only shown when not in score or compare view) -->
    <div v-if="currentView !== 'score' && currentView !== 'compare'" class="visualization-container">
      <!-- Compare button - only shown in genre view -->
      <div v-if="currentView === 'genre'" class="compare-controls">
        <button 
          v-if="!compareMode" 
          @click="enableCompareMode" 
          class="compare-button"
          title="Select multiple scores to compare"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M12 1a1 1 0 0 1 1 1v10.755S12 11 8 11s-5 1.755-5 1.755V2a1 1 0 0 1 1-1h8zM4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4z"/>
            <path d="M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
          </svg>
          Compare Scores
        </button>
        
        <!-- Compare mode controls -->
        <div v-else class="compare-active">
          <span class="selected-count">
            {{ selectedScores.length }} of {{ maxCompareScores }} selected
          </span>
          <button 
            @click="cancelCompareMode" 
            class="cancel-compare"
          >
            Cancel
          </button>
          <button 
            @click="viewSelectedScores" 
            class="view-selected"
            :disabled="selectedScores.length === 0"
          >
            Compare Selected
          </button>
        </div>
      </div>
      
      <!-- Main tree container -->
      <div ref="treeContainer" class="tree-container" :class="{'compare-mode': compareMode}"></div>
      
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
      
      <!-- Selection indicator for compare mode -->
      <div v-if="compareMode" class="selection-instructions">
        <p>Select up to {{ maxCompareScores }} scores to compare. Click on a score node to select/deselect it.</p>
      </div>
      
      <!-- Node details panel -->
      <div v-if="selectedNode && !compareMode" class="node-details">
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
    </div>

    <!-- Score View Container -->
    <div v-if="currentView === 'score'" class="visualization-container score-view-container">
      <!-- Loading state -->
      <div v-if="scoreLoading" class="score-loading">
        <div class="loading-spinner"></div>
        <p>Loading music score...</p>
      </div>
      
      <!-- Error state -->
      <div v-else-if="scoreError" class="score-error">
        <h3>Error Loading Score</h3>
        <p>{{ scoreError }}</p>
        <button 
          @click="navigateToBreadcrumb(breadcrumbs[breadcrumbs.length - 2] || breadcrumbs[0])" 
          class="back-button">
          Back to {{ breadcrumbs[breadcrumbs.length - 2]?.text || 'List' }}
        </button>
      </div>
      
      <!-- Score content -->
      <div v-else class="score-content-wrapper">
        <!-- IMPORTANT: This is the ref that needs to be fixed -->
        <div ref="scoreRenderer" class="score-renderer">
          <!-- Score will be rendered here by renderScore function -->
          <div class="pre-render-placeholder" v-if="!scoreData">
            <p>Loading music score visualization...</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Comparison View Container -->
    <div v-if="currentView === 'compare'" class="compare-view-container">
      
      <div class="comparison-controls">
      </div>
      
      <div class="score-comparison-grid" :class="`scores-${selectedScores.length}`">
        <!-- Create containers with proper IDs -->
        <div v-for="(score, index) in selectedScores" 
            :key="index" 
            class="comparison-score-container">
          <!-- Score title -->
          <h3 class="score-title">{{ score.name }}</h3>
          
          <!-- Container for the score renderer -->
          <div :id="`comparison-renderer-${index}`" class="comparison-renderer">
            <div class="score-loading">
              <div class="loading-spinner"></div>
              <p>Loading {{ score.name }}...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
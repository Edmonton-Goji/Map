function isMobile() {
  return window.matchMedia("(max-width: 991px)").matches;
}

function useExactLocation(feature) {
  return feature.get("Map Visibility") === "Map Exact Location";
}

let map = "";
const Trees = {
  layer: "",
  records: [],
  withPhotos: [],
};

// fields to show on the info panel when selecting a tree
const displayFields = ["Age", "Condition"];

// data and objects related to the Add a Tree functionality
const NewTree = {
  latitude: null,
  longitude: null,
  layerSource: new ol.source.Vector(),
  layer: null,
  selectingLocation: false,

  locationSelected: function () {
    return this.latitude && this.longitude;
  },
};

//setup loading screen
document.addEventListener("DOMContentLoaded", function () {
  // Show the loading screen
  document.getElementById("loading-screen").style.display = "flex";
});

async function fetchTreeRecords() {
  // Fetch data from Airtable
  const baseId = "appQryFCb5Fi3nZ4c";
  const tableName = "tbljBWCUMUSwrF2co";
  const mapViewId = "viwTCPyNj85isXVsc";
  const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableName}?view=${mapViewId}`;
  const airTablePersonalAccessToken =
    "patS6srnbXVthid6g.8b1b2fe74ad1685642ceadbb93e63b8223ee21d14a569f9debe2e948a563170a";
  let offset = "";

  const headers = {
    Authorization: `Bearer ${airTablePersonalAccessToken}`,
  };
  let response = await fetch(airtableUrl, {
    headers,
  });
  let data = await response.json();
  Trees.records = data.records;
  offset = data.offset;

  // airtable has 100 record limit per request. offset is returned until all records are fetched
  while (offset) {
    const url = airtableUrl + `&offset=${offset}`;
    let response = await fetch(url, {
      headers,
    });
    let data = await response.json();
    Trees.records = [...Trees.records, ...data.records];
    offset = data.offset;
  }

  addTreeMarkers();
}

function getTreeStyle(feature) {
  return new ol.style.Style({
    image: new ol.style.Icon({
      src: "img/Goji-Logo_40x101.png",
      scale: 0.5,
    }),
    text: new ol.style.Text({
      font: "12px Segoe UI,sans-serif",
      fill: new ol.style.Fill({ color: "#000" }),
      stroke: new ol.style.Stroke({
        color: "#fff",
        width: 3,
      }),
      offsetY: 35,
      text: map.getView().getZoom() >= 16 ? feature.get("Tree Name") : "",
    }),
  });
}

function selectStyle(feature, resolution) {
  let selectStyle;
  if (useExactLocation(feature)) {
    selectStyle = new ol.style.Style({
      image: new ol.style.Icon({
        src: "img/Goji-Logo_40x101.png",
        scale: 0.6,
      }),
      text: new ol.style.Text({
        font: "14px Segoe UI,sans-serif",
        fill: new ol.style.Fill({ color: "#000" }),
        stroke: new ol.style.Stroke({
          color: "#add8e6",
          width: 3,
        }),
        offsetY: 40,
        text: map.getView().getZoom() >= 16 ? feature.get("Tree Name") : "",
      }),
      zIndex: 9999,
    });
  } else {
    const radiusInMeters = 1500; // Set this to your desired radius in meters
    const radiusInPixels = radiusInMeters / resolution;

    selectStyle = new ol.style.Style({
      image: new ol.style.Circle({
        radius: radiusInPixels,
        fill: new ol.style.Fill({
          color: "rgba(255, 255, 255, 0.2)",
        }),
        stroke: new ol.style.Stroke({
          color: "navy",
          width: 2,
        }),
      }),
    });
  }
  return selectStyle;
}

// select interaction - handled manually so that it plays nice with adding a tree
const selectClick = new ol.interaction.Select({
  condition: ol.events.condition.never,
  style: selectStyle,
});

function addTreeMarkers() {
  const treeFeatures = [];

  // Add markers to the map
  Trees.records.forEach(function (record) {
    const treeFeature = new ol.Feature({
      geometry: new ol.geom.Point(
        ol.proj.fromLonLat([
          record.fields["Tree Longitude"],
          record.fields["Tree Latitude"],
        ])
      ),
    });
    treeFeature.setId(record.id);

    for (let propertyName in record.fields) {
      treeFeature.set(propertyName, record.fields[propertyName]);
    }

    treeFeatures.push(treeFeature);

    if ("Photo" in record.fields) {
      Trees.withPhotos.push(record);
    }
  });

  const baseTileLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
  });

  Trees.layer = new ol.layer.Vector({
    source: new ol.source.Vector({
      features: treeFeatures,
    }),
    style: getTreeStyle,
    // Openlayers 9.0.0 bug fix to add this class - unused otherwise
    className:"gojiVectors",
  });

  NewTree.layer = new ol.layer.Vector({
    source: NewTree.layerSource,
    style: new ol.style.Style({
      fill: new ol.style.Fill({
        color: "rgba(255, 0, 0, 0.2)",
      }),
      stroke: new ol.style.Stroke({
        color: "red",
        width: 2,
      }),
    }),
    // Openlayers 9.0.0 bug fix to add this class - unused otherwise
    className:"newGojiVectors",
  });

  // Set up the map
  map = new ol.Map({
    target: "map",
    layers: [baseTileLayer, Trees.layer, NewTree.layer],
    view: new ol.View({
      zoom: 6,
      enableRotation: false,
      maxZoom: 19,
      minZoom: 5,
    }),
  });

  resetMapPosition();
  setupMapEvents();

  // hide the loading screen
  document.getElementById("loading-screen").style.display = "none";
}

function resetMapPosition() {
  // default position shows all of Alberta
  if (isMobile()) {
    map
      .getView()
      .fit([
        -12653500.201822834, 7053485.787818839, -12616155.49509524,
        7127026.133374718,
      ]);
  } else {
    map
      .getView()
      .fit([
        -12667290.997087441, 7058482.967890004, -12595222.244393982,
        7108840.631905936,
      ]);
  }
}

function setupMapEvents() {
  map.addInteraction(selectClick);
  map.on("click", function (event) {
    if (NewTree.selectingLocation) {
      selectClick.getFeatures().clear();
      const coordinate = event.coordinate;
      NewTree.latitude = ol.proj.toLonLat(coordinate)[1].toFixed(5);
      NewTree.longitude = ol.proj.toLonLat(coordinate)[0].toFixed(5);
      setSelectedLocation();
      disableSelectingLocation();
    } else {
      const treeFeature = map.forEachFeatureAtPixel(
        event.pixel,
        function (feature) {
          return feature;
        }
      );
      if (treeFeature) {
        selectClick.getFeatures().clear();
        clearSelectedLocation();
        selectClick.getFeatures().push(treeFeature);
        zoomToTree(treeFeature.getId());
      }
    }
  });
}

function scrollInfoPanelUp() {
  if (isMobile()) {
    // on mobile, move the div up or down so that the top edge aligns with the top edge of the screen
    const infoPanelDiv = document.getElementById("infoPanel");
    const rect = infoPanelDiv.getBoundingClientRect();
    const offset = window.scrollY;
    const top = rect.top + offset;

    window.scrollTo({
      top: top,
      behavior: "smooth",
    });
  } else {
    // on desktop, scroll to the top of the info panel
    resetInfoPanelScrollPosition();
  }
}

// reset the info panel to the top of the content - desktop mode only
function resetInfoPanelScrollPosition() {
  const infoPanelDiv = document.getElementById("infoPanel");
  infoPanelDiv.scrollTop = 0;
}

// reset screen so that the map is fully visible at the top of the device
function showMobileMap() {
  document.scrollingElement.scrollTop = 0;
}

function createGoogleMapsButton(feature) {
  const googleMapsButton = document.createElement("button");
  googleMapsButton.style.border = "none";
  googleMapsButton.style.background = "none";
  googleMapsButton.title = "Open in Google Maps";
  const googleMapsIcon =
    '<img id="googleMapsIcon" src="img/google-maps-old.svg" style="width: 48px; height: 48px">';
  googleMapsButton.innerHTML = googleMapsIcon;
  googleMapsButton.addEventListener("click", function () {
    const latitude = feature.get("Tree Latitude");
    const longitude = feature.get("Tree Longitude");
    let url =
      "https://www.google.com/maps/search/?api=1&query=" +
      latitude +
      "%2C" +
      longitude;
    window.open(url);
  });

  return googleMapsButton;
}

function createCarouselItem(image, index) {
  // create carousel indicator
  const indicator = document.createElement("button");
  indicator.setAttribute("data-bs-target", "#treeCarousel");
  indicator.setAttribute("data-bs-slide-to", index);
  indicator.setAttribute("aria-label", "Slide " + (index + 1));

  // create carousel item
  const item = document.createElement("div");
  item.classList.add("carousel-item");

  // create image element
  const img = document.createElement("img");
  img.classList.add("d-block", "w-100");
  img.src = image.url;

  if (index === 0) {
    indicator.classList.add("active");
    item.classList.add("active");
  }

  // add image to item and item to inner carousel
  item.appendChild(img);

  return { indicator, item };
}

function showTreeInfo(feature) {
  if (feature) {
    let html = "";
    const name = feature.get("Tree Name");
    html += `<p class="treeName"><strong>${name}</strong></p>`;
    const description = feature.get("Description");
    if (description) {
      html += `<p>${description}</p>`;
    }

    if (useExactLocation(feature)) {
      html += `<p><strong>Address:</strong> ${feature.get("Address")}</p>`;
    } else {
      html += `<p><strong>Neighbourhood:</strong> ${feature.get("Neighbourhood Text")}</p>`;
    }

    displayFields.forEach(function (field) {
      const fieldValue = feature.get(field);
      if (fieldValue) {
        if (field.slice(-3) === "(m)") {
          // convert meters to feet
          const measureFeet = (fieldValue * 3.28084).toFixed(2);
          html += `<p><strong>${field.slice(0,-4)}:</strong> ${fieldValue.toFixed(2)}m (${measureFeet} ft)</p>`;
        } else {
          html += `<p><strong>${field}:</strong> ${fieldValue}</p>`;
        }
      }
    });

    // add species info
    const treeGenus = feature.get("Genus species Text");
    if (treeGenus) {
      html += `<p><strong>Species:</strong> ${treeGenus}</p>`;

      const speciesDescription = feature.get("Species Description");
      if (speciesDescription) {
        html += `<p>${speciesDescription}</p>`;
      }
    }

    // Update Info Panel with Tree Information
    const infoPanel = document.getElementById("infoPanel-content");
    infoPanel.style.padding = "20px";
    infoPanel.innerHTML = html;

    // Add Google Maps button to bottom of Tree Info
    if (useExactLocation(feature)) {
      const googleMapsButton = createGoogleMapsButton(feature);
      infoPanel.appendChild(googleMapsButton);
    }

    //set up image carousel

    resetCarousel();

    const photos = feature.get("Photo");
    if (photos) {
      const carouselIndicators = document.querySelector(".carousel-indicators");
      const carouselInner = document.querySelector(".carousel-inner");

      photos.forEach((image, index) => {
        const { indicator, item } = createCarouselItem(image, index);
        carouselIndicators.appendChild(indicator);
        carouselInner.appendChild(item);
      });

      // show carousel controls if there are multiple images
      toggleCarouselControls(photos.length > 1);

      // Click to Fullscreen images
      if (document.fullscreenEnabled) {
        const carouselImages = document.querySelectorAll(
          "#treeCarousel .carousel-item img"
        );
        carouselImages.forEach((image) => {
          image.style.cursor = "zoom-in";
          image.addEventListener("click", function () {
            if (!document.fullscreenElement) {
              if (image.requestFullscreen) {
                image.requestFullscreen();
              } else if (image.webkitRequestFullscreen) {
                image.webkitRequestFullscreen();
              } else if (image.webkitEnterFullscreen) {
                image.webkitEnterFullscreen();
              }
              image.style.cursor = "zoom-out";
            } else {
              document.exitFullscreen();
              image.style.cursor = "zoom-in";
            }
          });
        });
      }
      const carousel = new bootstrap.Carousel("#treeCarousel");
    }
  }
}

function resetCarousel() {
  const carouselIndicators = document.querySelector(".carousel-indicators");
  carouselIndicators.innerHTML = "";
  const carouselInner = document.querySelector(".carousel-inner");
  carouselInner.innerHTML = "";
}

function toggleCarouselControls(show) {
  const carouselIndicators = document.querySelector(".carousel-indicators");
  const carouselNextBtn = document.querySelector(".carousel-control-next");
  const carouselPrevBtn = document.querySelector(".carousel-control-prev");
  const displayStyle = show ? "" : "none";
  
  carouselNextBtn.style.display = displayStyle;
  carouselPrevBtn.style.display = displayStyle;
  carouselIndicators.style.display = displayStyle;
}

function selectTree(treeId) {
  // Clear the current selection
  selectClick.getFeatures().clear();
  const feature = Trees.layer.getSource().getFeatureById(treeId);
  // Add the feature to the selection
  selectClick.getFeatures().push(feature);
  zoomToTree(treeId);
}

// Zoom to the location of the tree
function zoomToTree(treeId) {
  // either show the mobile map or reset the info panel scroll position for desktop
  isMobile() ? showMobileMap() : resetInfoPanelScrollPosition();

  // Zoom the map to the corresponding feature and display its information
  const feature = Trees.layer.getSource().getFeatureById(treeId);
  const treeExtent = feature.getGeometry().getExtent();
  const desiredZoom = useExactLocation(feature) ? 16 : 13.5;

  map.getView().fit(treeExtent, {
    duration: 500,
    minResolution:
      (map.getView().getZoom() < desiredZoom && useExactLocation(feature)) ||
      !useExactLocation(feature)
        ? map.getView().getResolutionForZoom(desiredZoom)
        : map.getView().getResolution(),
  });
  showTreeInfo(feature);

  // either show the mobile map or reset the info panel scroll position for desktop
  // run this a second time once content is finished loading
  isMobile() ? showMobileMap() : resetInfoPanelScrollPosition();
}

// Zoom to the location of the neighbourhood
function zoomToNeighbourhood(neighbourhood) {
  showMobileMap();
  map.getView().animate({
    center: ol.proj.fromLonLat([
      neighbourhood.fields["Longitude"],
      neighbourhood.fields["Latitude"],
    ]),
    zoom: 15,
    duration: 500,
  });
}

// zoom to the Location of the municipality
function zoomToMunicipality(municipality) {
  showMobileMap();
  map.getView().animate({
    center: ol.proj.fromLonLat([municipality.longitude, municipality.latitude]),
    zoom: 13,
    duration: 500,
  });
}

// Pagination

const rowsPerPage = 10; // Set the number of photos per page

function createPaginationContainer() {
  const paginationContainer = document.createElement("div");
  paginationContainer.classList.add("mt-3");

  const nav = document.createElement("nav");
  const ul = document.createElement("ul");
  ul.className = "pagination justify-content-center flex-wrap";

  nav.appendChild(ul);
  paginationContainer.appendChild(nav);
  return paginationContainer;
}

function showPhotoGallery() {
  resetCarousel();
  clearSelectedLocation();
  const infoPanel = document.getElementById("infoPanel-content");
  infoPanel.innerHTML = `<p class="treeName"><strong>Photo Gallery</strong></p>`;
  infoPanel.style.padding = "20px 0 0 0";

  // Create a wrapper div for the paginated content
  const paginatedContent = document.createElement("div");
  paginatedContent.id = "paginatedContent";

  const paginationTop = createPaginationContainer();
  const paginationBottom = createPaginationContainer();
  infoPanel.appendChild(paginationTop);
  infoPanel.appendChild(paginatedContent);
  infoPanel.appendChild(paginationBottom);

  function displayPhotos(startIndex) {
    paginatedContent.innerHTML = "";
    for (
      let i = startIndex;
      i < startIndex + rowsPerPage && i < Trees.withPhotos.length;
      i++
    ) {
      const tree = Trees.withPhotos[i];
      const treePhoto = document.createElement("img");
      treePhoto.src = tree.fields["Photo"][0].url;
      treePhoto.style.width = "100%";

      // add fullscreen on click behavior to image
      if (document.fullscreenEnabled) {
        treePhoto.style.cursor = "zoom-in";
        treePhoto.addEventListener("click", function () {
          if (!document.fullscreenElement) {
            if (treePhoto.requestFullscreen) {
              treePhoto.requestFullscreen();
            } else if (treePhoto.webkitRequestFullscreen) {
              treePhoto.webkitRequestFullscreen();
            } else if (image.webkitEnterFullscreen) {
              image.webkitEnterFullscreen();
            }
            treePhoto.style.cursor = "zoom-out";
          } else {
            document.exitFullscreen();
            treePhoto.style.cursor = "zoom-in";
          }
        });
      }

      // create Tree Name paragraph element
      const treeName = document.createElement("p");
      treeName.textContent = tree.fields["Tree Name"];
      treeName.style["text-align"] = "center";
      treeName.style["font-weight"] = "bold";
      treeName.style.cursor = "pointer";

      // Zoom to tree when clicking on the Tree Name
      treeName.addEventListener("click", function (event) {
        selectTree(tree.id);
      });
      paginatedContent.appendChild(treePhoto);
      paginatedContent.appendChild(treeName);
    }
  }

  function setupPagination() {
    const ulTop = paginationTop.querySelector("ul");
    const ulBottom = paginationBottom.querySelector("ul");
    updatePagination(ulTop);
    updatePagination(ulBottom);

    function updatePagination(ul) {
      ul.innerHTML = ""; // Clear existing pagination items
      const totalPages = Math.ceil(Trees.withPhotos.length / rowsPerPage);

      for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement("li");
        li.className = "page-item";
        const a = document.createElement("a");
        a.className = "page-link";
        a.href = "#";
        a.textContent = i;

        a.addEventListener("click", (e) => {
          e.preventDefault();
          const page = parseInt(e.target.textContent);
          displayPhotos((page - 1) * rowsPerPage);
          setActivePage(page);
          scrollInfoPanelUp();
        });

        li.appendChild(a);
        ul.appendChild(li);
      }
    }
  }

  function setActivePage(page) {
    const pageItemsTop = paginationTop.querySelectorAll(".page-item");
    const pageItemsBottom = paginationBottom.querySelectorAll(".page-item");

    updateActivePage(pageItemsTop);
    updateActivePage(pageItemsBottom);

    function updateActivePage(pageItems) {
      pageItems.forEach((item, index) => {
        item.classList.toggle("active", index === page - 1);
      });
    }
  }

  displayPhotos(0);
  setupPagination();
  setActivePage(1);
  scrollInfoPanelUp();
}

function showAddATree() {
  resetCarousel();
  clearSelectedLocation();
  const infoPanel = document.getElementById("infoPanel-content");
  infoPanel.innerHTML = `<p class="treeName"><strong>Add a Goji</strong></p><p>To add a goji, first locate it using either your current GPS coordinates or by selecting the location of the goji on the map. Once you've located the goji, the "Add Goji" button will open a nomination form in a new window and ask you for additional information about the goji plant. Please be as thorough as possible to increase the chance that your submission will be verified and added to the map.</p>`;
  infoPanel.style.padding = "20px";

  // Create a new container element
  const addTreeContainer = document.createElement("div");

  // Add Bootstrap class for vertical stacking of buttons
  addTreeContainer.classList.add("d-grid", "gap-4");

  // Create the Current Location button
  const currentLocationButton = document.createElement("button");
  currentLocationButton.classList.add("btn", "btn-danger");
  currentLocationButton.textContent = "Current Location";

  // Create the Select Location button
  const selectLocationButton = document.createElement("button");
  selectLocationButton.id = "selectLocationButton";
  selectLocationButton.classList.add("btn", "btn-dark");
  selectLocationButton.textContent = "Select Location";

  // Create the selected location / error message div element
  const selectedLocationMessage = document.createElement("div");
  selectedLocationMessage.id = "selectedLocation";
  selectedLocationMessage.innerHTML = "No Selected Location.";

  // Create the Add Tree button
  const addTreeButton = document.createElement("button");
  addTreeButton.id = "addTreeButton";
  addTreeButton.classList.add("btn", "btn-danger");
  addTreeButton.textContent = "Add Goji";
  addTreeButton.disabled = true;

  // Append the buttons to the new div
  addTreeContainer.appendChild(currentLocationButton);
  addTreeContainer.appendChild(selectLocationButton);
  addTreeContainer.appendChild(selectedLocationMessage);
  addTreeContainer.appendChild(addTreeButton);

  // Append the new div to the container
  infoPanel.appendChild(addTreeContainer);

  // Function to get current location using Geolocation API
  function getCurrentLocation() {
    disableSelectingLocation();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        selectCurrentPosition,
        showError
      );
    } else {
      selectedLocationMessage.innerHTML =
        "Geolocation is not supported by this browser.";
    }
  }

  // Function to Select Current Position
  function selectCurrentPosition(position) {
    NewTree.latitude = position.coords.latitude.toFixed(5);
    NewTree.longitude = position.coords.longitude.toFixed(5);
    setSelectedLocation();
    // scrollInfoPanelUp();
  }

  // Function to handle errors
  function showError(error) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        selectedLocationMessage.innerHTML =
          "User denied the request for Geolocation.";
        break;
      case error.POSITION_UNAVAILABLE:
        selectedLocationMessage.innerHTML =
          "Location information is unavailable.";
        break;
      case error.TIMEOUT:
        selectedLocationMessage.innerHTML =
          "The request to get user location timed out.";
        break;
      case error.UNKNOWN_ERROR:
        selectedLocationMessage.innerHTML = "An unknown error occurred.";
        break;
    }
  }

  // Add event listeners for the buttons
  currentLocationButton.addEventListener("click", getCurrentLocation);
  selectLocationButton.addEventListener("click", enableSelectingLocation);
  addTreeButton.addEventListener("click", addTreeAtLocation);
  scrollInfoPanelUp();
}

function addTreeAtLocation() {
  if (NewTree.locationSelected()) {
    const airtableFormUrl = `https://airtable.com/appQryFCb5Fi3nZ4c/pags82ZrRUulWHOg4/form?prefill_Tree Latitude=${NewTree.latitude}&prefill_Tree Longitude=${NewTree.longitude}`;
    // opens a new window with the airtable form for nominating a tree
    window.open(airtableFormUrl, "_blank");
  }
}

function enableSelectingLocation() {
  if (NewTree.selectingLocation) {
    disableSelectingLocation();
  } else {
    NewTree.selectingLocation = true;
    const mapElement = document.getElementById("map");
    mapElement.style.cursor = "crosshair";
    document.getElementById("selectLocationButton").textContent = "Cancel";
  }
}

function disableSelectingLocation() {
  NewTree.selectingLocation = false;
  const mapElement = document.getElementById("map");
  mapElement.style.cursor = "auto";
  document.getElementById("selectLocationButton").textContent =
    "Select Location";
}

function setSelectedLocation() {
  clearSelectedLocation();
  const selectedLocationDiv = document.getElementById("selectedLocation");
  selectedLocationDiv.innerHTML =
    "<p>Selected Location:</p><p>Latitude: " +
    NewTree.latitude +
    "<br>Longitude: " +
    NewTree.longitude +
    "</p>";
  const center = ol.proj.fromLonLat([NewTree.longitude, NewTree.latitude]);
  const circleGeometry = new ol.geom.Circle(center, 3);
  const circleFeature = new ol.Feature(circleGeometry);
  NewTree.layerSource.addFeature(circleFeature);
  map.getView().animate({
    center: center,
    zoom: 19,
    duration: 500,
  });
  const addTreeButton = document.getElementById("addTreeButton");
  addTreeButton.disabled = false;
}

function clearSelectedLocation() {
  NewTree.layerSource.clear();
}

// hide carousel controls by default
toggleCarouselControls(false);

fetchTreeRecords();

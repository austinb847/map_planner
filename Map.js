import * as React from 'react';
import './index.css';
import { useState, useRef, useEffect, useCallback } from 'react';
import MapGL, {
	Marker,
	FullscreenControl,
	GeolocateControl,
	NavigationControl,
	WebMercatorViewport,
} from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Geocoder from 'react-map-gl-geocoder';
import 'react-map-gl-geocoder/dist/mapbox-gl-geocoder.css';
import ViewColleges from './Map/AllColleges.js';
import { feature, featureCollection, bbox } from '@turf/turf';
import _ from 'lodash';
import RouteLayer from './RouteLayer';
import { Icon, Loader, Dimmer, Segment } from 'semantic-ui-react';
import {
	getIconColorByLocationType,
	getIconNameByLocationType,
} from '../../services/indices';

function Map(props) {
	const {
		getCustomFromMap,
		tripOptions,
		locations,
		showAllColleges,
		selectedRouteType,
	} = props;
	const geocoderContainerRef = useRef();
	const [viewport, setViewport] = useState({
		latitude: 37.0902,
		longitude: -95.7129,
		zoom: 2,
	});
	const mapRef = useRef();
	const handleViewportChange = useCallback(
		(newViewport) => setViewport(newViewport),
		[]
	);
	const [standardRoute, setStandardRoute] = useState(featureCollection([]));
	const [optimalRouteThere, setOptimalRouteThere] = useState(
		featureCollection([])
	);
	const [optimalRouteBack, setOptimalRouteBack] = useState(
		featureCollection([])
	);
	const [routeLoad, setRouteLoad] = useState(false);

	const getRoute = () => {
		setRouteLoad(true);
		fetch(assembleQueryURL())
			.then((res) => res.json())
			.then((res) => {
				if (res.waypoints.length > 12) {
					window.alert('Maximum number of points reached.');
				}

				if (selectedRouteType === 'optimize') {
					let optimizedRoute = getOptimizedRoute(res);
					setOptimalRouteThere(optimizedRoute.tripThere);
					setOptimalRouteBack(optimizedRoute.tripBack);
					setMapBounds(optimizedRoute.tripThere);
				} else {
					let routeGeoJSON = featureCollection([
						feature(res.routes[0].geometry),
					]);
					setStandardRoute(routeGeoJSON);
					setMapBounds(routeGeoJSON);
				}
				setRouteLoad(false);
			});
	};

	const getOptimizedRoute = (route) => {
		let routes = splitRoute(route);
		let routeThereGeoJSON = featureCollection([
			feature(routes.tripThere.trips[0].geometry),
		]); 
		let routeBackGeoJSON = featureCollection([
			feature(routes.tripBack.trips[0].geometry),
		]);
		return {
			tripThere: routeThereGeoJSON,
			tripBack: routeBackGeoJSON,
		};
	};

	const splitRoute = (route) => {
		const { waypoints, trips, distance, duration } = route;
		const points = waypoints.map((point) => {
			return {
				long: point.location[0],
				lat: point.location[1],
			};
		});
		const fullRoute = trips[0].geometry.coordinates.map((e) => {
			return e;
		});
		const pointsIndex = points.map((e) => {
			return _.findIndex(fullRoute, function(el) {
				return el.includes(e.lat);
			}); //get index of each coordinate
		});
		const lastStop = Math.max(...pointsIndex); //get the highest index. This is the last stop
		const tripThere = fullRoute.slice(0, lastStop + 1); //split route to get the trip there
		const tripBack = fullRoute.slice(lastStop, fullRoute.length + 1); //split the route to get the trip back home
		const newTripThereObj = {
			...route,
			trips: [
				{
					geometry: {
						coordinates: tripThere,
						type: 'LineString',
					},
					distance: distance,
					duration: duration,
				},
			],
		};

		const newTripBackObj = {
			...route,
			trips: [
				{
					geometry: {
						coordinates: tripBack,
						type: 'LineString',
					},
					distance: distance,
					duration: duration,
				},
			],
		};
		return {
			tripThere: newTripThereObj,
			tripBack: newTripBackObj,
		};
	};

	const setMapBounds = (route) => {
		const [minLng, minLat, maxLng, maxLat] = bbox(route);
		const view = new WebMercatorViewport(viewport);
		const { longitude, latitude, zoom } = view.fitBounds(
			[[minLng, minLat], [maxLng, maxLat]],
			{
				padding: 175,
			}
		);
		handleViewportChange({
			...viewport,
			longitude,
			latitude,
			zoom,
			transitionDuration: 2000,
		});
	};

	const assembleQueryURL = () => {
		const coords = props.locations.map((location) => {
			return [location.long, location.lat];
		});
		if (selectedRouteType === 'optimize') {
			return (
				'https://api.mapbox.com/optimized-trips/v1/mapbox/driving/' +
				coords.join(';') +
				'?roundtrip=true&overview=full&steps=true&geometries=geojson&source=first&&access_token=' +
				process.env.REACT_APP_MAPBOX_ACCESS_TOKEN
			);
		} else {
			return (
				'https://api.mapbox.com/directions/v5/mapbox/driving/' +
				coords.join(';') +
				'?overview=full&steps=true&geometries=geojson&access_token=' +
				process.env.REACT_APP_MAPBOX_ACCESS_TOKEN
			);
		}
	};

	useEffect(() => {
		if (locations.length >= 2) {
			getRoute();
		} else {
			//Reset route line if location is less than 2
			resetRoutes();
		}
	}, [locations.length, selectedRouteType]);

	const resetRoutes = () => {
		setStandardRoute(featureCollection([]));
		setOptimalRouteThere(featureCollection([]));
		setOptimalRouteBack(featureCollection([]));
	};

	return (
		<React.Fragment>
			<div style={{ height: '100vh' }}>
				<div
					ref={geocoderContainerRef}
					style={{
						position: 'absolute',
						top: 20,
						left: 20,
						zIndex: 1,
					}}
				/>
				<MapGL
					{...viewport}
					width='100%'
					height='100%'
					mapStyle='mapbox://styles/mapbox/streets-v11'
					onViewportChange={handleViewportChange}
					ref={mapRef}
					mapboxApiAccessToken={
						process.env.REACT_APP_MAPBOX_ACCESS_TOKEN
					}
					logoPosition='bottom-right'
					minZoom={3}
					maxZoom={16}
				>
					{showAllColleges && (
						<ViewColleges
							mapRef={mapRef}
							currentViewPort={viewport}
							onViewPortChange={handleViewportChange}
						/>
					)}
					{routeLoad && (
						<Dimmer active>
							<Loader inverted>Getting Route</Loader>
						</Dimmer>
					)}
					<div style={{ position: 'absolute', right: 10, top: 60 }}>
						<NavigationControl />
					</div>{' '}
					{locations.length > 0 &&
						locations.map((loc, index) => {
							return (
								<Marker
									latitude={loc.lat}
									longitude={loc.long}
									offsetLeft={-20}
									offsetTop={-10}
									key={index}
								>
									<Icon
										size='small'
										inverted
										circular
										color={getIconColorByLocationType(
											loc.type
										)}
										name={getIconNameByLocationType(
											loc.type
										)}
									/>
								</Marker>
							);
						})}
					<div style={{ position: 'absolute', right: 33 }}>
						<FullscreenControl
							container={document.querySelector('body')}
						/>
					</div>
					<div
						style={{ position: 'absolute', right: 0, maxZoom: 15 }}
					>
						<GeolocateControl
							positionOptions={{ enableHighAccuracy: true }}
							trackUserLocation={true}
							showUserLocation={true}
						/>
					</div>
					{selectedRouteType === 'optimize' &&
						tripOptions === 'tripThere' && (
							<RouteLayer
								data={optimalRouteThere}
								sourceId='routeThere'
								lineId='routeLineThere'
								symbolId='routeArrowThere'
								lineColor='cornflowerblue'
								arrowColor='red'
							/>
						)}
					{selectedRouteType === 'optimize' &&
						tripOptions === 'tripBack' && (
							<RouteLayer
								data={optimalRouteBack}
								sourceId='routeBack'
								lineId='routeLineBack'
								symbolId='routeArrowBack'
								lineColor='green'
								arrowColor='red'
							/>
						)}
					{selectedRouteType === 'standard' && (
						<RouteLayer
							data={standardRoute}
							sourceId='standardRoute'
							lineId='standardRouteLine'
							symbolId='standardRouteArrow'
							lineColor='orange'
							arrowColor='red'
						/>
					)}
					<Geocoder
						mapRef={mapRef}
						containerRef={geocoderContainerRef}
						mapboxApiAccessToken={
							process.env.REACT_APP_MAPBOX_ACCESS_TOKEN
						}
						placeholder='Enter Start Location Here'
						countries='us'
						zoom={3}
						onResult={getCustomFromMap}
						collapsed={true}
						marker={false}
					/>
				</MapGL>
			</div>
		</React.Fragment>
	);
}

export default Map;

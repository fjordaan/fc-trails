# fc-trails
Mobile web application for walking trails in Fulham Cemetery



# Claude instructions

## Big picture
This project will start with a single walking trail, the Tree Trail, but it should be created in such a way to make it easy to create more walking trails with the same template, using the content management approach described below.
For this reason the content for each trail should probably live in a subfolder of the repo, for example tree-trail/ for the first one. 

## Technology
This is a web application optimised for mobile. It will rely mainly on HTML, CSS, JavaScript, and SVG. No React. We don't need external CSS libraries, or CSS preprocessors. You can use a CSS Reset stylesheet. Don't use Tailwind. 
We will use the Nunito font, served from Google Fonts.
We will use Google Material Icons, with the Rounded style, served from Google Fonts.

## App structure
The app consists of the following core screens. Wireframes for each are in /wireframes
1. Cover
2. Intro
3. Waypoint (there will be many of these)
4. Photo overlay
5. Web view overlay (this will load an external web page into an Iframe)

## Layout and interaction
The layout should adapt to the size of the mobile viewport, without scrolling. It should feel as much as possible like an app. 
The header and footer blocks will be fixed, while the content area expands or shrinks to fill the available space.

I'm undecided if this will be a single-page app, or if the screens will be separate HTML pages. I would prefer separate HTML pages, but interaction should feel application-like. For example, the ability to navigate between pages using a left or right swipe gesture, with smooth animation.

## Navigation
The trail can be navigated either in a linear fashion, page by page, or by tapping a Waypoint marker on the map.
The user can always go to the next page in the trail by swiping left, or the previous page by swiping right. (Except when they swipe on the map, because that would pan the map.)
The Cover page has a 'Start the trail' link that goes to the Intro page.
The Cover page also has a map showing all the Waypoint markers.
The Intro page and Waypoint pages have a Back link in the header that returns to the Cover page.
The Intro page and Waypoint pages have pagination links in the footer that go to the previous or next page in the trail.
The Intro page and Waypoint page header will also show the current page number in the header, in the format 1/n where n is the number of pages in the trail, and 1 is the Intro page.

## Map
On the Cover and Waypoint pages, the content area is occupied with a map. 
The map can be panned and zoomed using multi-touch gestures, the same as Google Maps.
The base map will be a custom image I provide, in PNG format.
On top of the base map will be waypoint markers, and a walking route indicated as a dotted line.
There will be a button on the map to show or hide the map key. It is collapsed by default.

## Content management
I suggest we manage content for the walking trail using a Markdown file, or possibly JSON.

## Trail content structure
A walking trail has the following properties:
- Trail slug (plain text, e.g. "tree-trail")
- Trail identifier (plain text, e.g. "Nature trail #3")
- Trail name (plain text, e.g. "Tree trail")
- Trail short title (plain text, e.g. "Fulham Cemetery Tree Trail")
- Trail description (plain text, one paragraph)
- Trail key (a list of properties, each with an icon, icon colour, title, and description - both plain text)
- Cemetery description (multiple paragraphs in Markdown format)
- Waypoints (an arbitrary number of points, each with the following structure)

## Waypoint content structure
Each Waypoint has the following properties:
- Marker symbol (number or letter)
- Marker colour (hex value)
- Waypoint key (comma-separated list of titles from the 'Trail key' properties)
- Waypoint title (plain text, e.g. "Magnolia")
- Waypoint description (plain text, one paragraph)
- Waypoint thumbnail image (this could simply be the first photo in the list of Waypoint photos)
- Waypoint photos (this could be a list of filenames, or simply the contents of the /photos subfolder)
- External URL (URL that links to an external web page with more information about the waypoint)

## Photo overlay
On the Waypoint page, when the user taps the thumbnail image, an overlay will open in the style of a bottom sheet, 80% of the height of the viewport. 
The photo overlay will display one photo at a time, in slideshow/carousel style (although it will not advance automatically).
Previous and Next buttons will overlay the photo, vertically centered.
An indicator at the bottom will display the number of photos, highlighting the current one.
The image is scaled to fit in the viewport by default, but the user can use multitouch gestures to pan and zoom the photo.
When the image is zoomed fully out (so that it is exactly the width or height of the viewport), left or right gesture will navigate to the next or previous photo.
The overlay can be closed by tapping outside the overlay.

## Web view overlay
On the Waypoint page, when the user taps the 'Read more' link, an overlay will animate in containing an Iframe with an external web page.
The web view overlay will have a fixed header and footer, and the content area with Iframe will fill the available space, scrolling vertically.
The header will have a 'Done' link that closes the overlay.
The footer will have an icon button that opens the external URL in a new browser window.

## Deployment
Let's see if we can deploy this on Github Pages, using the custom domain fulhamcemeteryfriends.org.uk which I own.
A trail will have the following URL: fulhamcemeteryfriends.org.uk/trails/(slug)


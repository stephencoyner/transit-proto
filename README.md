# Transit Planning Platform

A data visualization and analysis tool for transit planners to explore ridership patterns, identify service issues, and make data-driven decisions.

**Live Demo:** [stephenstransitapp.vercel.app](https://stephenstransitapp.vercel.app)

![Transit Platform Screenshot](docs/screenshot.png)

## Features

- **Route Analysis**: View ridership metrics (boardings, alightings, load) at the route, trip, and stop level
- **Comparison Mode**: Compare two date ranges side-by-side to identify seasonal or temporal patterns
- **Segment Visualization**: See load patterns along route segments with color-coded maps
- **Trip Filtering**: Filter by time of day, day of week, pattern, and metric thresholds
- **Stop Amenities**: Identify high-ridership stops lacking ADA compliance or amenities
- **Bookmarking**: Save and share specific analysis views

## Example Scenarios

### Scenario 1: Back-to-School Crowding Analysis

**What's going on?**
Back to school season has hit UW and Route 44 is experiencing severe crowding on PM peak trips near campus.

**What would a planner do?**
Make note of the impacted trips, review the specific segments where crowding is occurring, and add service to those areas and times (larger buses, more trips, or new patterns that serve those areas more directly).

**How to Review:**
1. Set the date range to September 15-30, 2025
2. Set the metric to "Maxload" (max passengers on the bus at any given time)
3. Click on the Routes tab and sort by maxload, highest first
4. Click on Route 44 (the one with 100 maxload)
5. Review the summary to see the days and times where maxload is highest
6. Filter by the Ballard Wallingford pattern and PM Peak time of day
7. Navigate to the Trips tab and filter by trips with over 99 maxload
8. Save a bookmark of this filtered view
9. Click into individual trips to review specific areas of crowding
10. Use the Grid view to see trip data in tabular format

---

### Scenario 2: Summer Ridership Analysis

**What's going on?**
Summer has ended and you want to review how ridership changed between spring and summer 2025. These patterns inform service levels for the next year. Route 70 had a major drop in summer ridership (expected), but downtown stops actually had ridership increases.

**What would a planner do?**
The increased downtown ridership points to different rider behavior—likely tourists or locals using the downtown area more in summer. A planner would consider adding more service downtown during summer, adding service to adjacent routes serving the same area, or creating new route variations focused on downtown while optimizing Route 70 in portions where ridership dropped.

**How to Review:**
1. Set Date Range 1 to Summer 2025, add Date Range 2 for Spring 2025
2. Set metric to "Average daily boardings"
3. Navigate to Routes tab and sort by largest decrease
4. Click on Route 70—notice downtown stops are green while the rest of the route dropped significantly
5. Filter by the U-District Station pattern to see the most impacted pattern
6. Change metric to "Average load"—notice loads increase downtown and the overall route had a smaller load drop than boardings (more tourists are riding through)
7. Save a bookmark for this analysis
8. Click into individual trips for detailed reports

---

### Scenario 3: Stop Amenity Planning

**What's going on?**
Your agency has received funding to upgrade stop amenities for ADA compliance and general improvements. You need to find high-ridership stops that currently lack desirable amenities.

**What would a planner do?**
Identify stops needing upgrades and save the list for funding allocation meetings.

**How to Review:**
1. Set date range to March–September 2025 and metric to "Average daily boardings"
2. Navigate to the Stops tab
3. Filter by stops with >300 boardings but no wheelchair access or tactile paving
4. Save a bookmark for this view
5. Remove filters and apply new filters: stops with >500 boardings, no advertisement, no real-time display
6. Save another bookmark

---

## End Result

A planner can identify and save actionable insights in minutes that would previously take weeks of data cleaning, processing, spreadsheet analysis, and GIS work.

## Tech Stack

- **Frontend**: Next.js, React, TypeScript
- **Mapping**: DeckGL, Mapbox GL
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **Data Generation**: Python (synthetic ridership data based on King County Metro patterns)

## Data

This platform uses synthetic ridership data modeled on realistic King County Metro patterns. The dataset includes:
- 10 routes
- 194 days (March–September 2025)
- 23+ million stop-level ridership records
- Seasonal patterns (spring vs summer)
- Time-of-day patterns (AM peak, PM peak, midday, evening)
- Special scenarios (back-to-school crowding, summer tourist patterns, holiday ridership)

## Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your Mapbox token and Supabase credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## License

MIT

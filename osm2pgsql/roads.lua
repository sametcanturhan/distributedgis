local roads = osm2pgsql.define_table({
    name = 'road_network',
    ids = { type = 'way', id_column = 'osm_id' },
    columns = {
        { column = 'name', type = 'text' },
        { column = 'highway', type = 'text', not_null = true },
        { column = 'geom', type = 'linestring', projection = 4326, not_null = true },
    },
})

local accepted_highways = {
    motorway = true,
    motorway_link = true,
    trunk = true,
    trunk_link = true,
    primary = true,
    primary_link = true,
    secondary = true,
    secondary_link = true,
    tertiary = true,
    tertiary_link = true,
    residential = true,
    living_street = true,
    unclassified = true,
}

function osm2pgsql.process_way(object)
    local highway = object.tags.highway

    if not highway or not accepted_highways[highway] then
        return
    end

    roads:insert({
        osm_id = object.id,
        name = object.tags.name,
        highway = highway,
        geom = object:as_linestring(),
    })
end

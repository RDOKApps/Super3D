# -*- coding: utf-8 -*-
"""
ArcGIS Python Toolbox for processing drone raster mosaics.

Tools:
  - CopyRasterFillNoData: Copies a raster and sets white/near-white pixels as
    NoData so that the empty fringe areas of a drone mosaic become transparent.
  - GenerateTileCache: Wraps the Manage Tile Cache and Export Tile Cache
    geoprocessing tools to produce a tile package (.tpkx) ready for upload.
"""

import arcpy
import os


class Toolbox:
    """ArcGIS Python Toolbox – Drone Raster NoData Fill & Tile Cache."""

    def __init__(self):
        self.label = "Drone Raster NoData Fill"
        self.alias = "DroneRasterNoDataFill"
        self.tools = [CopyRasterFillNoData, GenerateTileCache]


# ---------------------------------------------------------------------------
# Tool 1 – Copy Raster and Fill NoData
# ---------------------------------------------------------------------------
class CopyRasterFillNoData:
    """Copy a drone mosaic raster and mark white fringe pixels as NoData."""

    def __init__(self):
        self.label = "Copy Raster and Fill NoData"
        self.description = (
            "Copies the input raster and converts white or near-white "
            "pixels (the empty fringe of a drone mosaic) to NoData so "
            "they render as transparent."
        )
        self.canRunInBackground = True

    # -- parameter definitions ------------------------------------------------
    def getParameterInfo(self):
        in_raster = arcpy.Parameter(
            displayName="Input Raster",
            name="in_raster",
            datatype="DERasterDataset",
            parameterType="Required",
            direction="Input",
        )

        out_raster = arcpy.Parameter(
            displayName="Output Raster",
            name="out_raster",
            datatype="DERasterDataset",
            parameterType="Required",
            direction="Output",
        )

        white_threshold = arcpy.Parameter(
            displayName="White Threshold (0-255)",
            name="white_threshold",
            datatype="GPLong",
            parameterType="Optional",
            direction="Input",
        )
        white_threshold.value = 250
        white_threshold.filter.type = "Range"
        white_threshold.filter.list = [200, 255]

        nodata_value = arcpy.Parameter(
            displayName="NoData Value",
            name="nodata_value",
            datatype="GPLong",
            parameterType="Optional",
            direction="Input",
        )
        nodata_value.value = 256

        pixel_type = arcpy.Parameter(
            displayName="Pixel Type",
            name="pixel_type",
            datatype="GPString",
            parameterType="Optional",
            direction="Input",
        )
        pixel_type.filter.type = "ValueList"
        pixel_type.filter.list = [
            "8_BIT_UNSIGNED",
            "8_BIT_SIGNED",
            "16_BIT_UNSIGNED",
            "16_BIT_SIGNED",
            "32_BIT_UNSIGNED",
            "32_BIT_SIGNED",
            "32_BIT_FLOAT",
            "64_BIT",
        ]
        pixel_type.value = "8_BIT_UNSIGNED"

        return [in_raster, out_raster, white_threshold, nodata_value, pixel_type]

    # -- validation -----------------------------------------------------------
    def isLicensed(self):
        return True

    def updateParameters(self, parameters):
        return

    def updateMessages(self, parameters):
        return

    # -- execution ------------------------------------------------------------
    def execute(self, parameters, messages):
        in_raster = parameters[0].valueAsText
        out_raster = parameters[1].valueAsText
        threshold = int(parameters[2].value) if parameters[2].value else 250
        nodata_val = int(parameters[3].value) if parameters[3].value else 256
        pixel_type = parameters[4].valueAsText or "8_BIT_UNSIGNED"

        messages.addMessage("Reading input raster: {}".format(in_raster))

        desc = arcpy.Describe(in_raster)
        band_count = desc.bandCount

        # Build a conditional expression that turns white/near-white pixels
        # into NoData.  For an RGB raster (3 bands) a pixel is considered
        # "white" when ALL bands exceed the threshold.
        if band_count >= 3:
            messages.addMessage(
                "Multi-band raster detected ({} bands). "
                "Pixels where all visible bands >= {} will become NoData.".format(
                    band_count, threshold
                )
            )
            # Create a composite condition: where all bands are above threshold
            # set to NoData value, otherwise keep original.
            # Use Con with a raster calculator expression.
            raster_obj = arcpy.Raster(in_raster)

            # Extract individual bands
            band1 = arcpy.sa.Raster(in_raster + "/Band_1")
            band2 = arcpy.sa.Raster(in_raster + "/Band_2")
            band3 = arcpy.sa.Raster(in_raster + "/Band_3")

            white_mask = (band1 >= threshold) & (band2 >= threshold) & (band3 >= threshold)

            # Process each band: where white, set to nodata_val; else keep original
            processed_bands = []
            for i in range(1, band_count + 1):
                band = arcpy.sa.Raster(in_raster + "/Band_{}".format(i))
                result = arcpy.sa.Con(white_mask, nodata_val, band)
                processed_bands.append(result)

            # Composite the bands back together
            composite = arcpy.CompositeBands_management(
                processed_bands, "in_memory/composite"
            )

            messages.addMessage("Copying result to: {}".format(out_raster))
            arcpy.management.CopyRaster(
                in_raster=composite.getOutput(0),
                out_rasterdataset=out_raster,
                pixel_type=pixel_type,
                nodata_value=nodata_val,
            )
        else:
            messages.addMessage(
                "Single-band raster detected. "
                "Pixels >= {} will become NoData.".format(threshold)
            )
            band = arcpy.sa.Raster(in_raster)
            result = arcpy.sa.Con(band >= threshold, nodata_val, band)

            messages.addMessage("Copying result to: {}".format(out_raster))
            arcpy.management.CopyRaster(
                in_raster=result,
                out_rasterdataset=out_raster,
                pixel_type=pixel_type,
                nodata_value=nodata_val,
            )

        # Build pyramids and calculate statistics on the output
        messages.addMessage("Building pyramids...")
        arcpy.management.BuildPyramids(out_raster)

        messages.addMessage("Calculating statistics...")
        arcpy.management.CalculateStatistics(out_raster)

        messages.addMessage("Done – output raster: {}".format(out_raster))
        return

    def postExecute(self, parameters):
        return


# ---------------------------------------------------------------------------
# Tool 2 – Generate Tile Cache
# ---------------------------------------------------------------------------
class GenerateTileCache:
    """Create a tile cache (TPKX) from a raster for web map publishing."""

    def __init__(self):
        self.label = "Generate Tile Cache"
        self.description = (
            "Generates a tile cache (.tpkx) from the input raster using "
            "a standard tiling scheme compatible with ArcGIS Online / "
            "Portal for ArcGIS."
        )
        self.canRunInBackground = True

    # -- parameter definitions ------------------------------------------------
    def getParameterInfo(self):
        in_raster = arcpy.Parameter(
            displayName="Input Raster",
            name="in_raster",
            datatype="DERasterDataset",
            parameterType="Required",
            direction="Input",
        )

        out_cache_location = arcpy.Parameter(
            displayName="Output Cache Folder",
            name="out_cache_location",
            datatype="DEFolder",
            parameterType="Required",
            direction="Input",
        )

        cache_name = arcpy.Parameter(
            displayName="Cache Name",
            name="cache_name",
            datatype="GPString",
            parameterType="Required",
            direction="Input",
        )
        cache_name.value = "DroneRasterCache"

        tiling_scheme = arcpy.Parameter(
            displayName="Tiling Scheme",
            name="tiling_scheme",
            datatype="GPString",
            parameterType="Optional",
            direction="Input",
        )
        tiling_scheme.filter.type = "ValueList"
        tiling_scheme.filter.list = [
            "ARCGISONLINE_SCHEME",
            "IMPORT_SCHEME",
        ]
        tiling_scheme.value = "ARCGISONLINE_SCHEME"

        scales = arcpy.Parameter(
            displayName="Scales (semicolon-separated)",
            name="scales",
            datatype="GPString",
            parameterType="Optional",
            direction="Input",
        )
        scales.value = ""

        max_level = arcpy.Parameter(
            displayName="Maximum Level of Detail",
            name="max_level",
            datatype="GPLong",
            parameterType="Optional",
            direction="Input",
        )
        max_level.value = 19
        max_level.filter.type = "Range"
        max_level.filter.list = [0, 23]

        export_tpkx = arcpy.Parameter(
            displayName="Export as TPKX",
            name="export_tpkx",
            datatype="GPBoolean",
            parameterType="Optional",
            direction="Input",
        )
        export_tpkx.value = True

        return [
            in_raster,
            out_cache_location,
            cache_name,
            tiling_scheme,
            scales,
            max_level,
            export_tpkx,
        ]

    # -- validation -----------------------------------------------------------
    def isLicensed(self):
        return True

    def updateParameters(self, parameters):
        return

    def updateMessages(self, parameters):
        return

    # -- execution ------------------------------------------------------------
    def execute(self, parameters, messages):
        in_raster = parameters[0].valueAsText
        cache_location = parameters[1].valueAsText
        cache_name = parameters[2].valueAsText or "DroneRasterCache"
        tiling_scheme = parameters[3].valueAsText or "ARCGISONLINE_SCHEME"
        scales_text = parameters[4].valueAsText or ""
        max_level = int(parameters[5].value) if parameters[5].value else 19
        do_export = parameters[6].value

        cache_path = os.path.join(cache_location, cache_name)

        # Build a scales list from either user input or ArcGIS Online defaults
        if scales_text.strip():
            scales = [s.strip() for s in scales_text.split(";") if s.strip()]
        else:
            # Standard ArcGIS Online / Web Mercator scale set up to max_level
            base_scales = [
                591657527.591555,
                295828763.795777,
                147914381.897889,
                73957190.948944,
                36978595.474472,
                18489297.737236,
                9244648.868618,
                4622324.434309,
                2311162.217155,
                1155581.108577,
                577790.554289,
                288895.277144,
                144447.638572,
                72223.819286,
                36111.909643,
                18055.954822,
                9027.977411,
                4513.988705,
                2256.994353,
                1128.497176,
                564.248588,
                282.124294,
                141.062147,
                70.5310735,
            ]
            scales = [str(s) for s in base_scales[: max_level + 1]]

        scale_values = ";".join(scales)

        messages.addMessage("Creating tile cache at: {}".format(cache_path))
        messages.addMessage("Tiling scheme: {}".format(tiling_scheme))
        messages.addMessage("Scales: {}".format(scale_values))

        # Step 1 – Manage Tile Cache (creates/updates the cache)
        arcpy.management.ManageTileCache(
            in_cache_location=cache_location,
            manage_mode="RECREATE_ALL_TILES",
            in_cache_name=cache_name,
            in_datasource=in_raster,
            tiling_scheme=tiling_scheme,
            import_tiling_scheme="",
            scales=scale_values,
        )

        messages.addMessage("Tile cache created successfully.")

        # Step 2 – Optionally export as a .tpkx tile package
        if do_export:
            tpkx_path = os.path.join(cache_location, cache_name + ".tpkx")
            messages.addMessage("Exporting tile cache to: {}".format(tpkx_path))

            arcpy.management.ExportTileCache(
                in_cache_source=cache_path,
                in_target_cache_folder=cache_location,
                in_target_cache_name=cache_name,
                export_cache_type="TILE_PACKAGE",
                storage_format_type="COMPACT_V2",
            )

            messages.addMessage("Tile package exported: {}".format(tpkx_path))
        else:
            messages.addMessage(
                "Skipping TPKX export. Cache is available at: {}".format(cache_path)
            )

        messages.addMessage("Done.")
        return

    def postExecute(self, parameters):
        return

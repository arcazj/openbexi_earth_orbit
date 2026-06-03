import numpy as np
from PIL import Image

def save_obj_with_texture(obj_filename, mtl_filename, img_filename, width, height):
    with open(obj_filename, 'w') as obj_file:
        obj_file.write(f"mtllib {mtl_filename}\n")
        obj_file.write("usemtl material_1\n")

        # Write vertices (corners of the plane)
        for y in range(height):
            for x in range(width):
                obj_file.write(f"v {x} {y} 0\n")

        # Write texture coordinates
        for y in range(height):
            for x in range(width):
                u = x / (width - 1)
                v = 1 - (y / (height - 1))
                obj_file.write(f"vt {u} {v}\n")

        # Write faces (2 triangles per square pixel)
        for y in range(height - 1):
            for x in range(width - 1):
                v1 = y * width + x + 1
                v2 = v1 + 1
                v3 = v1 + width
                v4 = v3 + 1

                obj_file.write(f"f {v1}/{v1} {v3}/{v3} {v2}/{v2}\n")
                obj_file.write(f"f {v2}/{v2} {v3}/{v3} {v4}/{v4}\n")

    with open(mtl_filename, 'w') as mtl_file:
        mtl_file.write("newmtl material_1\n")
        mtl_file.write(f"map_Kd {img_filename}\n")

# Load the image to get size
img = Image.open('../textures/oneweb.PNG')
width, height = img.size

# Save OBJ and MTL files
save_obj_with_texture('../textures/oneweb.OBJ', '../textures/oneweb.MTL', '../textures/oneweb.PNG', width, height)

print("OBJ file with texture saved as 'texturesoneweb_model.obj'")

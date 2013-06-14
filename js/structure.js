var LineStyle = function(structure) {
  var self = {
    params : {},
    structure: {},
  }
  return {

  };
};

function get_element_contents(element) {
  var contents = '';
  var k = element.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      contents += k.textContent;
    }
    k = k.nextSibling;
  }
  return contents;
}

var Cam = function() {
  var self = {
    projection : mat4.create(),
    modelview : mat4.create(),

    center : vec3.create(),
    zoom : 40,
    rotation : mat4.create(),
    translation : mat4.create(),
    update_mat : true,
  }; 


  function update_if_needed() {
    if (!self.update_mat) {
      return;
    }
    mat4.identity(self.modelview);
    mat4.translate(self.modelview, self.modelview, 
                   [-self.center[0], -self.center[1], -self.center[2]]);
    mat4.mul(self.modelview, self.rotation, self.modelview);
    mat4.identity(self.translation);
    mat4.translate(self.translation, self.translation, [0,0, -self.zoom]);
    mat4.mul(self.modelview, self.translation, self.modelview);
    self.update_mat = false;
  }

  mat4.perspective(self.projection, 45.0, gl.viewportWidth / gl.viewportHeight, 
                   0.1, 400.0);
  mat4.translate(self.modelview, self.modelview, [0, 0, -20]);
  return {

    set_center : function(point) {
      self.update_mat = true;
      vec3.copy(self.center, point);
    },
    rotate_z : function(delta) {
      self.update_mat = true;
      var tm = mat4.create();
      mat4.rotate(tm, tm, delta, [0,0,1]);
      mat4.mul(self.rotation, tm, self.rotation);
    },
    rotate_x: function(delta) {
      self.update_mat = true;
      var tm = mat4.create();
      mat4.rotate(tm, tm, delta, [1,0,0]);
      mat4.mul(self.rotation, tm, self.rotation);
    },
    rotate_y : function(delta) {
      self.update_mat = true;
      var tm = mat4.create();
      mat4.rotate(tm, tm, delta, [0,1,0]);
      mat4.mul(self.rotation, tm, self.rotation);
    },
    zoom : function(delta) {
      self.update_mat = true;
      self.zoom += delta;
    },

    bind : function(shader) {
      update_if_needed();
      gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
      shader.projection = gl.getUniformLocation(shader, 'projection_mat');
      shader.modelview = gl.getUniformLocation(shader, 'modelview_mat');
      gl.uniformMatrix4fv(shader.projection, false, self.projection);
      gl.uniformMatrix4fv(shader.modelview, false, self.modelview);
    }
  };
};


var PV = function(dom_element, width, height) {
  var canvas_element = document.createElement('canvas');
  canvas_element.width = width || 500;
  canvas_element.height = height || 500;
  dom_element.appendChild(canvas_element);

  var self = {
    dom_element : canvas_element,
    objects : [],
  };


  function init_gl() {
    // todo wrap in try-catch for browser which don't support WebGL
    gl = self.dom_element.getContext('experimental-webgl');
    gl.viewportWidth = self.dom_element.width;
    gl.viewportHeight = self.dom_element.height;

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
  }

  function shader_from_element(gl, element) {
    var shader_code = get_element_contents(element);
    var shader;
    if (element.type == 'x-shader/x-fragment') {
      shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (element.type == 'x-shader/x-vertex') {
      shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
      console.error('could not determine type for shader');
      return null;
    }
    gl.shaderSource(shader, shader_code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function init_shader() {
    var frag_shader = shader_from_element(gl, document.getElementById('shader-fs'));
    var vert_shader = shader_from_element(gl, document.getElementById('shader-vs'));
    var shader_program = gl.createProgram();
    gl.attachShader(shader_program, vert_shader);
    gl.attachShader(shader_program, frag_shader);
    gl.linkProgram(shader_program);
    if (!gl.getProgramParameter(shader_program, gl.LINK_STATUS)) {
      console.error('could not initialise shaders')
    }
    return shader_program;
  };

  function mouse_up(event) {
    self.dom_element.removeEventListener('mousemove', mouse_move, false);
    self.dom_element.removeEventListener('mouseup', mouse_up, false);
    self.dom_element.removeEventListener('mouseout', mouse_out, false);
    document.removeEventListener('mousemove', mouse_move);
  }
  var shader_program;
  var cam;
  
  function init_pv() {
    init_gl();
    cam = Cam();
    shader_program = init_shader();
    gl.useProgram(shader_program);
  }

  function color_for_element(ele, out) {
    if (!out) {
      out = vec4.create();
    }
    if (ele == 'C') {
      vec4.set(out, 1, 1, 1, 1);
      return out;
    }
    if (ele == 'N') {
      vec4.set(out, 0, 0, 1, 1);
      return out;
    }
    if (ele == 'O') {
      vec4.set(out, 1, 0, 0, 1);
      return out;
    }
    if (ele == 'S') {
      vec4.set(out, 1, 1, 0, 1);
      return out;
    }
    vec4.set(out, 1, 0, 1, 1);
    return out;
  }

  var pv = {
    add : function(stuff) {
      var tb = gl.createBuffer();
      var interleaved = [];
      var mp = vec3.create();
      var clr = vec4.create();
      stuff.each_atom(function(atom) {
        // for atoms without bonds, we draw a small cross, otherwise these atoms 
        // would be invisible on the screen.
        if (atom.bonds().length) {
          atom.each_bond(function(bond) {
            var pos = bond.atom_one().pos();
            var clr_one = color_for_element(bond.atom_one().element(), clr);
            interleaved.push(pos[0]);
            interleaved.push(pos[1]);
            interleaved.push(pos[2]);
            interleaved.push(clr_one[0]);
            interleaved.push(clr_one[1]);
            interleaved.push(clr_one[2]);

            bond.mid_point(mp);
            interleaved.push(mp[0]);
            interleaved.push(mp[1]);
            interleaved.push(mp[2]);
            interleaved.push(clr_one[0]);
            interleaved.push(clr_one[1]);
            interleaved.push(clr_one[2]);

            var clr_two = color_for_element(bond.atom_two().element(), clr);
            interleaved.push(mp[0]);
            interleaved.push(mp[1]);
            interleaved.push(mp[2]);
            interleaved.push(clr_two[0]);
            interleaved.push(clr_two[1]);
            interleaved.push(clr_two[2]);

            pos = bond.atom_two().pos();
            interleaved.push(pos[0]);
            interleaved.push(pos[1]);
            interleaved.push(pos[2]);
            interleaved.push(clr_two[0]);
            interleaved.push(clr_two[1]);
            interleaved.push(clr_two[2]);
          });
        } else {
          var cs = 0.2;
          var pos = atom.pos();
          color_for_element(atom.element(), clr);
          interleaved.push(pos[0]-cs); interleaved.push(pos[1]); interleaved.push(pos[2]);
          interleaved.push(clr[0]); interleaved.push(clr[1]); interleaved.push(clr[2]);
          interleaved.push(pos[0]+cs); interleaved.push(pos[1]); interleaved.push(pos[2]);
          interleaved.push(clr[0]); interleaved.push(clr[1]); interleaved.push(clr[2]);

          interleaved.push(pos[0]); interleaved.push(pos[1]-cs); interleaved.push(pos[2]);
          interleaved.push(clr[0]); interleaved.push(clr[1]); interleaved.push(clr[2]);
          interleaved.push(pos[0]); interleaved.push(pos[1]+cs); interleaved.push(pos[2]);
          interleaved.push(clr[0]); interleaved.push(clr[1]); interleaved.push(clr[2]);

          interleaved.push(pos[0]); interleaved.push(pos[1]); interleaved.push(pos[2]-cs);
          interleaved.push(clr[0]); interleaved.push(clr[1]); interleaved.push(clr[2]);
          interleaved.push(pos[0]); interleaved.push(pos[1]); interleaved.push(pos[2]+cs);
          interleaved.push(clr[0]); interleaved.push(clr[1]); interleaved.push(clr[2]);
        }
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, tb);
      var fa = new Float32Array(interleaved);
      gl.bufferData(gl.ARRAY_BUFFER, fa, gl.STATIC_DRAW);

      var data = { vert_buffer : tb, items : interleaved.length/6};
      self.objects.push(data);
    },

    draw : function() {
      cam.bind(shader_program);
      gl.clear(gl.COLOR_BUFFER_BIT| gl.DEPTH_BUFFER_BIT);
      for (var i=0; i<self.objects.length; i+=1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, self.objects[i].vert_buffer);
        var vert_attrib = gl.getAttribLocation(shader_program, 'vertex_pos');
        gl.enableVertexAttribArray(vert_attrib);
        gl.vertexAttribPointer(vert_attrib, 3, gl.FLOAT, false, 6*4, 0*4);
        var clr_attrib = gl.getAttribLocation(shader_program, 'vertex_color');
        gl.vertexAttribPointer(clr_attrib, 3, gl.FLOAT, false, 6*4, 3*4);
        gl.enableVertexAttribArray(clr_attrib);
        gl.drawArrays(gl.LINES, 0, self.objects[i].items);
      }
    },
    center_on : function(thing) {
      cam.set_center(thing.center());
    }
  };
  function mouse_wheel(event) {
    cam.zoom(event.wheelDelta*0.05);
    pv.draw();
  }
  function mouse_down(event) {
    event.preventDefault();
    self.dom_element.addEventListener('mousemove', mouse_move, false);
    document.addEventListener('mousemove', mouse_move, false);
    self.dom_element.addEventListener('mouseup', mouse_up, false);
    document.addEventListener('mouseup', mouse_up, false);
    self.dom_element.addEventListener('mouseout', mouse_out, false);
    last_mouse_pos = { x: event.pageX, y: event.pageY };
  }


  function mouse_move(event) {
    var new_mouse_pos = { x : event.pageX, y : event.pageY };
    var delta = { x : new_mouse_pos.x - last_mouse_pos.x,
                  y : new_mouse_pos.y - last_mouse_pos.y};
                  
    var speed = 0.005;
    cam.rotate_x(speed*delta.y);
    cam.rotate_y(speed*delta.x);
    last_mouse_pos = new_mouse_pos;
    pv.draw();
  }

  function mouse_out(event) {}
  self.dom_element.addEventListener('mousewheel', mouse_wheel, false);
  self.dom_element.addEventListener('mousedown', mouse_down, false);

  document.addEventListener('DOMContentLoaded', init_pv);
  return pv;
};

var Structure = function() {
  var  self = {
    chains : [],
    next_atom_index : 0,
  };

  return {
    add_chain : function(name) {
      chain = Chain(this, name);
      self.chains.push(chain);
      return chain;
    },
    next_atom_index : function() { 
      var next_index = self.next_atom_index; 
      self.next_atom_index+=1; 
      return next_index; 
    },
    chains : function() { return self.chains; },
    each_residue : function(callback) {
      for (var i = 0; i < self.chains.length; i+=1) {
        self.chains[i].each_residue(callback);
      }
    },
    each_atom : function(callback) {
      for (var i = 0; i < self.chains.length; i+=1) {
        self.chains[i].each_atom(callback);
      }
    },
    /// render structure with the following style
    render_as : function(style) {
      if (style == 'lines') {
        return LineStyle(this);
      };
    },
    center : function() {
      var sum = vec3.create();
      var count = 1;
      this.each_atom(function(atom) {
        vec3.add(sum, sum, atom.pos());
        count+=1;
      });
      if (count) {
        vec3.scale(sum, sum, 1/count);
      }
      return sum;
    },
    connect : function(atom_a, atom_b) {
      var bond = new Bond(atom_a, atom_b);
      atom_a.add_bond(bond);
      atom_b.add_bond(bond);
      return bond;
    },
    // determine connectivity structure. for simplicity only connects atoms of the same 
    // residue and peptide bonds
    derive_connectivity : function() {

       var this_structure = this;
       var prev_residue;
       this.each_residue(function(res) {
         var d = vec3.create();
         for (var i = 0; i < res.atoms().length; i+=1) {
          for (var j = 0; j < i; j+=1) {
            var sqr_dist = vec3.sqrDist(res.atom(i).pos(), res.atom(j).pos());
            if (sqr_dist < 1.6*1.6) {
               this_structure.connect(res.atom(i), res.atom(j));
            }
          }
         }
         if (prev_residue) {
          var c_atom = prev_residue.atom('C');
          var n_atom = res.atom('N');
          if (c_atom && n_atom) {
            var sqr_dist = vec3.sqrDist(c_atom.pos(), n_atom.pos());
            if (sqr_dist < 1.6*1.6) {
              this_structure.connect(n_atom, c_atom);
            }
          }
         }
         prev_residue = res;
       });
    }
  };
}


var Chain = function(structure, name) {
  var self = {
    name : name,
    residues: [],
    structure : structure
  };
  return {
    name : function() { return self.name; },

    add_residue : function(name, num) {
      var residue = Residue(this, name, num);
      self.residues.push(residue);
      return residue;
    },
    each_atom : function(callback) {
      for (var i = 0; i< self.residues.length; i+=1) {
        self.residues[i].each_atom(callback);
      }
    },
    each_residue : function(callback) {
      for (var i = 0; i < self.residues.length; i+=1) {
        callback(self.residues[i]);
      }
    },
    residues : function() { return self.residues; },
    structure : function() { return self.structure; } 
  };
}

var Residue = function(chain, name, num) {
  var self = {
       name : name,
       num : num,
       atoms : [],
       chain: chain
  };

  return {
    name : function() { return self.name; },
    num : function() { return self.num; },
    add_atom : function(name, pos, element) {
      var atom = Atom(this, name, pos, element);
      self.atoms.push(atom);
      return atom;
    },
    each_atom : function(callback) {
      for (var i =0; i< self.atoms.length; i+=1) {
        callback(self.atoms[i]);
      }
    },
    atoms : function() { return self.atoms; },
    chain : function() { return self.chain; },
    atom : function(index_or_name) { 
      if (typeof index_or_name == 'string') {
        for (var i =0; i < self.atoms.length; ++i) {
          if (self.atoms[i].name() == index_or_name) {
            return self.atoms[i];
          }
        }
      }
      return self.atoms[index_or_name]; 
    },


    structure : function() { return self.chain.structure(); }
  }
}

var Atom = function(residue, name, pos, element) {
  var self = {
     name : name,
     pos : pos,
     element : element,
     bonds : [],
     index : residue.structure().next_atom_index(),
     residue: residue,
  };
  return {
    name : function() { return self.name; },
    pos : function() { return self.pos; },
    element : function() { return self.element; },
    add_bond : function(bond) { self.bonds.push(bond); },
    bonds : function() { return self.bonds; },
    residue: function() { return self.residue; },
    structure : function() { return self.residue.structure(); },
    each_bond : function(callback) {
      for (var i = 0; i < self.bonds.length; ++i) {
        callback(self.bonds[i]);
      }
    },
    index : function() { return self.index; }
  };
}


var Bond = function(atom_a, atom_b) {
  var self = {
    atom_one : atom_a,
    atom_two : atom_b,
  };
  return {
    atom_one : function() { return self.atom_one; },
    atom_two : function() { return self.atom_two; },

    // calculates the mid-point between the two atom positions
    mid_point : function(out) { 
      if (!out) {
        out = vec3.create();
      }
      vec3.add(out, self.atom_one.pos(), self.atom_two.pos());
      vec3.scale(out, out, 0.5);
      return out;
    }
  };
}


var load_pdb_from_element = function(element) {
  return load_pdb(get_element_contents(element));
}
// a truly minimalistic PDB parser. It will die as soon as the input is 
// not well-formed. it only reas ATOM and HETATM records, everyting else 
// is ignored. in case of multi-model files, only the first model is read.
var load_pdb = function(text) {
  
  var structure = Structure();
  var curr_chain = null;
  var curr_res = null;
  var curr_atom = null;
  
  function parse_and_add_atom(line, hetatm) {
    var alt_loc = line[16];
    if (alt_loc!=' ' && alt_loc!='A') {
      return;
    }
    var chain_name = line[21];
    var res_name = line.substr(17, 3);
    var atom_name = line.substr(12, 4).trim();
    var rnum_num = parseInt(line.substr(22, 4));
    var ins_code = line[26];
    var update_residue = false;
    var update_chain = false;
    if (!curr_chain || curr_chain.name() != chain_name) {
      update_chain = true;
      update_residue = true;
    }
    if (!curr_res || curr_res.num() != rnum_num) {
      update_residue = true;
    }
    if (update_chain) {
      curr_chain = structure.add_chain(chain_name);
    }
    if (update_residue) {
      curr_res = curr_chain.add_residue(res_name, rnum_num);
    }
    var pos = [];
    for (var i=0;i<3;++i) {
      pos.push(parseFloat(line.substr(30+i*8, 8)));
    }
    curr_res.add_atom(atom_name, pos, line.substr(77, 2).trim());
  }

  var lines = text.split(/\r\n|\r|\n/g);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (line.substr(0, 6) == 'ATOM  ') {
      parse_and_add_atom(line, false);
    }
    if (line.substr(0, 6) == 'HETATM') {
      parse_and_add_atom(line, true);
    }
    if (line.substr(0, 3) == 'END') {
      break;
    }
  }
  structure.derive_connectivity();
  return structure;
};
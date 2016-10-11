
#include "itkImageJS.h"
#include <vnl/vnl_inverse.h>
// Binding code
EMSCRIPTEN_BINDINGS(itk_image_j_s) {
  class_<itkImageJS>("itkImageJS")
    .constructor<>()
    .function("ReadImage", &itkImageJS::ReadImage)
    .function("WriteImage", &itkImageJS::WriteImage)
    .function("MountDirectory", &itkImageJS::MountDirectory)
    .function("GetBufferPointer", &itkImageJS::GetBufferPointer)
    .function("GetBufferSize", &itkImageJS::GetBufferSize)
    .function("GetSpacing", &itkImageJS::GetSpacing)
    .function("GetOrigin", &itkImageJS::GetOrigin)
    .function("GetDimensions", &itkImageJS::GetDimensions)
    .function("GetDirection", &itkImageJS::GetDirection)
    .function("GetPixel", &itkImageJS::GetPixel)
    .function("GetPixelWorld", &itkImageJS::GetPixelWorld)
    .function("SetPixel", &itkImageJS::SetPixel)
    .function("SetPixelWorld", &itkImageJS::SetPixelWorld)
    .function("GetDataType", &itkImageJS::GetDataType)
    .function("GetFilename", &itkImageJS::GetFilename)
    .function("SetFilename", &itkImageJS::SetFilename)
    .function("GetSlice", &itkImageJS::GetSlice)
    .function("TransformPhysicalPointToIndex", &itkImageJS::TransformPhysicalPointToIndex)
    .function("TransformIndexToPhysicalPoint", &itkImageJS::TransformIndexToPhysicalPoint)
    ;
}

itkImageJS::itkImageJS(){
  m_Interpolate = InterpolateFunctionType::New();
}

itkImageJS::~itkImageJS(){
  m_VectorSlice.clear();
}

/*
* This function should only be used when executing in NODE.js in order to mount 
* a path in the filesystem to the NODEFS system. 
*
*/
void itkImageJS::MountDirectory(const string filename){
  
  EM_ASM_({

      var path = require('path');
      var fs = require('fs');
      var allpath = Pointer_stringify($0);
      var dir = path.dirname(allpath);

      var currentdir = path.sep;
      var sepdirs = dir.split(path.sep);

      for(var i = 0; i < sepdirs.length; i++){
        currentdir += sepdirs[i];
        try{
          FS.mkdir(currentdir);
        }catch(e){
          //console.error(e);
        }
        currentdir += path.sep;
      }
      try{
        FS.mount(NODEFS, { root: currentdir }, dir);
      }catch(e){
        //console.error(e);
      }

    }, filename.c_str()
  );
  
}

/*
* This function reads an image from the NODEFS or IDBS system and sets up the different attributes in itkImageJS
* If executing in the browser, you must save the image first using FS.write(filename, buffer).
* If executing inside NODE.js use mound directory with the image filename. 
*/

  void itkImageJS::ReadImage(){

    try{
      
      ImageFileReader::Pointer reader = ImageFileReader::New();
      char* filename = (char*)this->GetFilename();
      reader->SetFileName(filename);
      reader->Update();
      InputImagePointerType image = reader->GetOutput();

      OrientImageFilterPointerType orienter = OrientImageFilterType::New();
      orienter->UseImageDirectionOn();
      orienter->SetDesiredCoordinateOrientation(itk::SpatialOrientation::ITK_COORDINATE_ORIENTATION_LPI);
      orienter->SetInput(image);
      orienter->Update();
      image = orienter->GetOutput();

      this->SetImage(image);
      this->Initialize();

    }catch(itk::ExceptionObject & err){
      cerr<<err<<endl;
    }
    
  }

  /*
  * After reading the image, it sets up different attributes
  */
  void itkImageJS::Initialize(){

    InputImagePointerType img = this->GetImage();
    m_Interpolate->SetInputImage(img);

    SizeType size = img->GetLargestPossibleRegion().GetSize();
    m_Size[0] = size[0];
    m_Size[1] = size[1];
    m_Size[2] = size[2];

    SpacingType spacing = img->GetSpacing();
    m_Spacing[0] = spacing[0];
    m_Spacing[1] = spacing[1];
    m_Spacing[2] = spacing[2];
    
    DirectionType direction = img->GetDirection();

    for(int i = 0; i < dimension*dimension; i++){
      m_Direction[i] = direction[i/dimension][i%dimension];
    }
    
    m_MapStringDirection["xspace"] = 0;
    m_MapStringDirection["yspace"] = 1;
    m_MapStringDirection["zspace"] = 2;

    for(int projectionDirection = 0; projectionDirection < 3; projectionDirection++){
      int directionIndex[2];
      int n = 0;
      for(int i = 0; i < 3; i++){
        if(projectionDirection != i){
          directionIndex[n] = i;
          n++;
        }
      }
    
      ImagePointerType2D img2d = ImageType2D::New();
      RegionType2D region;
      SizeType2D size;
      size[0] = m_Size[directionIndex[0]];
      size[1] = m_Size[directionIndex[1]];
      region.SetSize(size);
      IndexType2D index;
      index.Fill(0);
      region.SetIndex(index);
      img2d->SetRegions(region);
      img2d->Allocate();
      img2d->FillBuffer(0);

      m_VectorSlice.push_back(img2d);
    }


    PointType origin = img->GetOrigin();

    ImageIteratorType it(img, img->GetLargestPossibleRegion());
    it.GoToBegin();

    while(!it.IsAtEnd()){
      PointType p;
      img->TransformIndexToPhysicalPoint(it.GetIndex(), p);
      origin[0] = min(p[0], origin[0]);
      origin[1] = min(p[1], origin[1]);
      origin[2] = min(p[2], origin[2]);
      ++it;
    }

    m_Origin[0] = origin[0];
    m_Origin[1] = origin[1];
    m_Origin[2] = origin[2];

    cout<<"orig"<<origin<<endl;

    // m_OffsetImage = OffsetImageType::New();
    // m_OffsetImage->SetRegions(this->GetImage()->GetLargestPossibleRegion());
    // m_OffsetImage->Allocate();

    // OffsetImageIteratorType offsetit(m_OffsetImage, m_OffsetImage->GetLargestPossibleRegion());
    // offsetit.GoToBegin();

    // PointType point;

    // int i, j, k;
    // for(point[2] = origin[2] + m_Spacing[2]*(m_Size[2]-1), k = 0; k < m_Size[2]; point[2] -= m_Spacing[2], k++){
    //   for(point[1] = origin[1] + m_Spacing[1]*(m_Size[1]-1), j = 0; j < m_Size[1]; point[1] -= m_Spacing[1], j++){
    //     for(point[0] = origin[0] + m_Spacing[0]*(m_Size[0]-1), i = 0; i < m_Size[0]; point[0] -= m_Spacing[0], i++){

    //       IndexType index;
    //       img->TransformPhysicalPointToIndex(point, index);
    //       offsetit.Set(img->ComputeOffset(index));
    //       ++offsetit;
    //     }
    //   }
    // }
    

    // ImageIteratorType it(this->GetImage(), this->GetImage()->GetLargestPossibleRegion());
    // m_OffsetImage = OffsetImageType::New();
    // m_OffsetImage->SetRegions(this->GetImage()->GetLargestPossibleRegion());
    // m_OffsetImage->Allocate();

    // OffsetImageIteratorType offsetit(m_OffsetImage, m_OffsetImage->GetLargestPossibleRegion());
    // offsetit.GoToBegin();

    // while(!offsetit.IsAtEnd()){

    //   IndexType index = offsetit.GetIndex();
    //   PointType point;
    //   point[0] = m_Origin[0] + index[0]*m_Spacing[0];
    //   point[2] = m_Origin[1] + index[1]*m_Spacing[1];
    //   point[1] = m_Origin[2] + index[2]*m_Spacing[2];

    //   img->TransformPhysicalPointToIndex(point, index);

    //   offsetit.Set(img->ComputeOffset(index));
    //   ++offsetit;
    // }
  }

  /*
  * Write the image to to the file system. 
  */
  void itkImageJS::WriteImage(){
    try{
    
      ImageFileWriter::Pointer writer = ImageFileWriter::New();
      char* filename = (char*)this->GetFilename();
      writer->SetFileName(filename);
      writer->SetInput(this->GetImage());
      writer->Update();
    }catch(itk::ExceptionObject & err){
      cerr<<err<<endl;
    }

  }

  /*
  * Get a slice from the image
  */
  inline int itkImageJS::GetSlice(string axis, int slice_num){


    int projectionDirection = m_MapStringDirection[axis];

    int directionIndex[2];
    int n = 0;
    for(int i = 0; i < 3; i++){
      if(projectionDirection != i){
        directionIndex[n] = i;
        n++;
      }
    }
    
    // InputImageOffsetValueType* offsetBuffer = m_OffsetImage->GetBufferPointer();

    ImagePointerType2D slice = m_VectorSlice[projectionDirection];
    ImageIterator2DType it(slice, slice->GetLargestPossibleRegion());
    it.GoToBegin();
    InputImagePointerType img = this->GetImage();
    const OffsetImageOffsetValueType* offsetOffsetTable = img->GetOffsetTable();

    // PointType point = img->GetOrigin();
    // point[projectionDirection] = slice_num;
    // IndexType index;
    // img->TransformPhysicalPointToIndex(point, index);

    int row_index = directionIndex[1];
    int col_index = directionIndex[0];

    int row_offset = offsetOffsetTable[row_index];
    int col_offset = offsetOffsetTable[col_index];

    int tz_offset = slice_num*offsetOffsetTable[projectionDirection];

    int row_size = tz_offset + m_Size[row_index]*row_offset;
    int col_size = m_Size[col_index];

    PixelType* imageBuffer = img->GetBufferPointer();
    
    for(int tzy_offset = tz_offset; tzy_offset < row_size; tzy_offset+=row_offset){
      for(int col = 0; col < col_size * col_offset; col+=col_offset){
        int tzyx_offset = tzy_offset + col;
        it.Set(imageBuffer[tzyx_offset]);
        ++it;
      }
    }

    int buf = (int)slice->GetBufferPointer();
    return buf/sizeof(PixelType);
  }